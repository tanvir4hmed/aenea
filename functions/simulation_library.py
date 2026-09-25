"""Household-scoped simulation definitions. Saving never publishes an event."""
import uuid
from botocore.exceptions import ClientError
from catalog import DEVICE_KINDS, read_catalog, text
from common import response


def read_library(table, owner):
    record = table.get_item(Key={"pk": f"H#{owner}", "sk": "SIMULATIONS"}, ConsistentRead=True).get("Item", {})
    return {"revision": record.get("revision"), "items": record.get("items", [])}


def validate_library(body, catalog):
    if not isinstance(body, dict) or set(body) != {"revision", "items"}:
        raise ValueError("Expected revision and saved simulations")
    if body["revision"] is not None:
        uuid.UUID(body["revision"])
    items = body["items"]
    if not isinstance(items, list) or len(items) > 50:
        raise ValueError("Save up to 50 simulations")
    devices = {item["id"]: item for item in catalog["devices"]}
    ids, total = set(), 0
    for item in items:
        if not isinstance(item, dict) or set(item) != {"id", "name", "type", "signals"}:
            raise ValueError("Invalid saved simulation")
        item["id"] = str(uuid.UUID(item["id"]))
        if item["id"] in ids:
            raise ValueError("Duplicate simulation ID")
        ids.add(item["id"])
        item["name"] = text(item["name"], 120)
        rows = item["signals"]
        if item["type"] not in {"single", "scenario"} or not isinstance(rows, list) or not 1 <= len(rows) <= 20:
            raise ValueError("A simulation needs 1–20 device alerts")
        if item["type"] == "single" and len(rows) != 1:
            raise ValueError("A single alert needs exactly one device")
        seen = set()
        for row in rows:
            if not isinstance(row, dict) or set(row) != {"deviceId", "kind", "observation"}:
                raise ValueError("Invalid simulation signal")
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
        total += len(rows)
    if total > 100:
        raise ValueError("Library supports 100 saved device alerts in total")
    return items


def save_library(table, owner, body):
    items = validate_library(body, read_catalog(table, owner))
    record = {"pk": f"H#{owner}", "sk": "SIMULATIONS", "revision": str(uuid.uuid4()), "items": items}
    options = {"ConditionExpression": "attribute_not_exists(pk)"}
    if body["revision"] is not None:
        options = {"ConditionExpression": "revision = :previous", "ExpressionAttributeValues": {":previous": body["revision"]}}
    try:
        table.put_item(Item=record, **options)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        return response(409, {"error": "Simulations changed elsewhere. Reload before saving."})
    return response(200, {"revision": record["revision"], "items": items})
