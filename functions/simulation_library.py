"""Household-scoped simulation definitions. Saving never publishes an event."""

import uuid
import json
import time
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from catalog import DEVICE_KINDS, read_catalog, text
from common import response
from simulation_profiles import validate_profile


def read_library(table, owner):
    record = table.get_item(Key={"pk": f"H#{owner}", "sk": "SIMULATIONS"}, ConsistentRead=True).get(
        "Item", {}
    )
    if record.get("storage") == "paged":
        items = []
        query = {
            "KeyConditionExpression": Key("pk").eq(f"H#{owner}#SIMLIB#{record['revision']}"),
            "ConsistentRead": True,
        }
        while True:
            page = table.query(**query)
            items.extend(row["definition"] for row in page["Items"])
            if not page.get("LastEvaluatedKey"):
                break
            query["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        after = table.get_item(
            Key={"pk": f"H#{owner}", "sk": "SIMULATIONS"}, ConsistentRead=True
        ).get("Item", {})
        if after.get("revision") != record["revision"]:
            raise ValueError("Library changed while loading. Refresh saved simulations.")
        return {"revision": record["revision"], "items": items}
    items = [
        {
            **item,
            "type": "single"
            if item.get("type") == "scenario" and len(item.get("signals", [])) == 1
            else item.get("type"),
        }
        for item in record.get("items", [])
    ]
    return {"revision": record.get("revision"), "items": items}


def validate_library(body, catalog):
    if not isinstance(body, dict) or set(body) != {"revision", "items"}:
        raise ValueError("Expected revision and saved simulations")
    if body["revision"] is not None:
        uuid.UUID(body["revision"])
    items = body["items"]
    if not isinstance(items, list) or len(items) > 250:
        raise ValueError("Save up to 250 simulations")
    devices = {item["id"]: item for item in catalog["devices"]}
    ids, total, singles = set(), 0, {}
    for item in items:
        if (
            not isinstance(item, dict)
            or set(item) - {"id", "name", "type", "signals", "profile"}
            or not {"id", "name", "type", "signals"} <= set(item)
        ):
            raise ValueError("Invalid saved simulation")
        item["id"] = str(uuid.UUID(item["id"]))
        if item["id"] in ids:
            raise ValueError("Duplicate simulation ID")
        ids.add(item["id"])
        item["name"] = text(item["name"], 120)
        rows = item["signals"]
        if (
            item["type"] not in {"single", "scenario"}
            or not isinstance(rows, list)
            or not 1 <= len(rows) <= 200
        ):
            raise ValueError("A simulation needs 1–200 device alerts")
        item["profile"] = validate_profile(item.get("profile"))
        if item["type"] == "single" and len(rows) != 1:
            raise ValueError("A single alert needs exactly one device")
        if item["type"] == "scenario" and len(rows) < 2:
            raise ValueError("A scenario needs at least two devices")
        seen = set()
        for row in rows:
            if (
                not isinstance(row, dict)
                or not {"deviceId", "kind", "observation"} <= set(row)
                or set(row) - {"deviceId", "kind", "observation", "severity"}
            ):
                raise ValueError("Invalid simulation signal")
            if row.get("severity", "auto") not in {"auto", "informational", "warning", "urgent"}:
                raise ValueError("Unsupported simulation severity")
            device = devices.get(row["deviceId"])
            if row["deviceId"] in seen:
                raise ValueError("Use each device only once per simulation")
            seen.add(row["deviceId"])
            if device and row["kind"] not in DEVICE_KINDS[device["type"]]:
                raise ValueError("Signal is incompatible with the device")
            # Removed devices remain editable/deletable in saved definitions, but cannot be triggered.
            uuid.UUID(row["deviceId"])
            if row["kind"] not in {kind for kinds in DEVICE_KINDS.values() for kind in kinds}:
                raise ValueError("Unsupported signal")
            row["observation"] = text(row["observation"], 600, False)
            if item["type"] == "single":
                key = (row["deviceId"], row["kind"])
                if key in singles:
                    raise ValueError(
                        f"Duplicate single alert: {singles[key]} and {item['name']}. Edit or reuse the existing definition."
                    )
                singles[key] = item["name"]
        total += len(rows)
        if len(json.dumps(item).encode()) > 300000:
            raise ValueError(
                "Definition exceeds 300 KB; shorten observations or split the scenario"
            )
    if total > 2000:
        raise ValueError("Library supports 2,000 saved device references")
    return items


def save_library(table, owner, body):
    items = validate_library(body, read_catalog(table, owner))
    revision = str(uuid.uuid4())
    # GC jobs survive interruption between writing a generation and publishing its pointer.
    for generation in {revision, body["revision"]} - {None}:
        table.put_item(
            Item={
                "pk": "LIBGC",
                "sk": owner + "#" + generation,
                "owner": owner,
                "generation": generation,
                "eligible_at": int(time.time()) + 900,
            }
        )
    record = {"pk": f"H#{owner}", "sk": "SIMULATIONS", "revision": revision, "storage": "paged"}

    def discard(generation):
        if not generation:
            return
        query = {
            "KeyConditionExpression": Key("pk").eq(f"H#{owner}#SIMLIB#{generation}"),
            "ConsistentRead": True,
        }
        while True:
            page = table.query(**query)
            with table.batch_writer() as writer:
                for row in page["Items"]:
                    writer.delete_item(Key={"pk": row["pk"], "sk": row["sk"]})
            if not page.get("LastEvaluatedKey"):
                break
            query["ExclusiveStartKey"] = page["LastEvaluatedKey"]

    try:
        with table.batch_writer() as writer:
            for item in items:
                writer.put_item(
                    Item={
                        "pk": f"H#{owner}#SIMLIB#{revision}",
                        "sk": item["id"],
                        "definition": item,
                    }
                )
    except Exception:
        discard(revision)
        raise
    options = {"ConditionExpression": "attribute_not_exists(pk)"}
    if body["revision"] is not None:
        options = {
            "ConditionExpression": "revision = :previous",
            "ExpressionAttributeValues": {":previous": body["revision"]},
        }
    try:
        table.put_item(Item=record, **options)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        discard(revision)
        return response(409, {"error": "Simulations changed elsewhere. Reload before saving."})
    discard(body["revision"])
    return response(200, {"revision": record["revision"], "items": items})
