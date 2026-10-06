"""Durable simulator runs, per-device ownership, resumable delivery and visible limits."""

import hashlib
import json
import time
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

from catalog import DEVICE_KINDS, read_catalog
from common import response
from incident_engine import attrs
from simulation_library import read_library
from simulation_profiles import expected_count, scheduled_state, validate_profile
from lifecycle import deleted


def run_key(owner, identity):
    return {"pk": f"H#{owner}", "sk": "RUN#" + identity}


def get_run(table, owner, identity):
    return table.get_item(Key=run_key(owner, identity), ConsistentRead=True).get("Item")


def view(run):
    return {
        key: run.get(key)
        for key in (
            "id",
            "status",
            "created_at",
            "names",
            "expected",
            "accepted",
            "message",
            "incident_ids",
            "revision",
        )
    }


def selection(items, ids, catalog):
    devices = {d["id"]: d for d in catalog["devices"]}
    chosen = [next((item for item in items if item["id"] == identity), None) for identity in ids]
    if any(item is None for item in chosen):
        raise ValueError("A selected definition was removed. Refresh before triggering.")
    occurrences, rows = {}, []
    for item in chosen:
        profile = validate_profile(item.get("profile"))
        for signal in item["signals"]:
            device = devices.get(signal["deviceId"])
            if (
                not device
                or not device["enabled"]
                or device["connection"] != "simulation"
                or signal["kind"] not in DEVICE_KINDS[device["type"]]
            ):
                raise ValueError(
                    "Selected definition contains an unavailable or incompatible device"
                )
            occurrences.setdefault(device["id"], []).append(item["name"])
            rows.append(
                {
                    **signal,
                    "profile": profile,
                    "index": 0,
                    "device_name": device["name"],
                    "category": "camera"
                    if device["type"] == "camera"
                    else "weather"
                    if device["type"] == "weather_feed"
                    else "sensor",
                }
            )
    duplicates = [
        f"{devices[key]['name']}: {' + '.join(names)}"
        for key, names in occurrences.items()
        if len(names) > 1
    ]
    if duplicates:
        raise ValueError("Device selected more than once — " + "; ".join(duplicates))
    if not 1 <= len(rows) <= 200:
        raise ValueError("Select 1–200 distinct devices")
    return chosen, rows


def start(table, owner, body):
    if not isinstance(body, dict) or set(body) != {"request_id", "definition_ids", "incident_id"}:
        raise ValueError("Expected run identity, saved definitions and optional incident")
    identity = str(uuid.UUID(body["request_id"]))
    ids = body["definition_ids"]
    if not isinstance(ids, list) or not ids or len(ids) > 250 or len(set(ids)) != len(ids):
        raise ValueError("Choose unique saved definitions")
    incident = str(uuid.UUID(body["incident_id"])) if body["incident_id"] else None
    digest = hashlib.sha256(json.dumps([sorted(ids), incident]).encode()).hexdigest()
    existing = get_run(table, owner, identity)
    if existing:
        if existing["digest"] != digest:
            raise ValueError("Run identity already used for different inputs")
        return response(200, view(existing))
    if incident:
        summary = table.get_item(
            Key={"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}, ConsistentRead=True
        ).get("Item", {})
        if (
            not summary
            or summary.get("resolved_at")
            or summary.get("deletion_started_at")
            or deleted(table, owner, incident)
        ):
            raise ValueError("Select an open incident or Automatic assignment")
    chosen, rows = selection(read_library(table, owner)["items"], ids, read_catalog(table, owner))
    locks_key = {"pk": f"H#{owner}", "sk": "SIMLOCKS"}
    locks = table.get_item(Key=locks_key, ConsistentRead=True).get("Item", {"devices": {}})
    conflicts = [row["device_name"] for row in rows if row["deviceId"] in locks["devices"]]
    if conflicts:
        raise ValueError("Stop the existing run for: " + ", ".join(conflicts))
    now = int(time.time())
    run = {
        **run_key(owner, identity),
        "id": identity,
        "digest": digest,
        "revision": str(uuid.uuid4()),
        "status": "running",
        "created_at": now,
        "names": [item["name"] for item in chosen],
        "rows": rows,
        "expected": sum(expected_count(row["profile"]) for row in rows),
        "accepted": 0,
        "incident_ids": [incident] if incident else [],
        "target": incident,
        "message": "Scheduled in the cloud. First delivery is due on the next worker tick.",
    }
    if len(json.dumps(run).encode()) > 300000:
        raise ValueError("Run exceeds 300 KB. Shorten observations or split selections.")
    updated = {
        **locks_key,
        "revision": str(uuid.uuid4()),
        "devices": {**locks["devices"], **{row["deviceId"]: identity for row in rows}},
    }
    put = {
        "TableName": table.name,
        "Item": attrs(updated),
        "ConditionExpression": "revision = :revision"
        if locks.get("revision")
        else "attribute_not_exists(pk)",
    }
    if locks.get("revision"):
        put["ExpressionAttributeValues"] = attrs({":revision": locks["revision"]})
    try:
        boto3.client("dynamodb").transact_write_items(
            TransactItems=[
                {"Put": put},
                {
                    "Put": {
                        "TableName": table.name,
                        "Item": attrs(run),
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
                {
                    "Put": {
                        "TableName": table.name,
                        "Item": attrs(
                            {
                                "pk": "SIMRUNS",
                                "sk": owner + "#" + identity,
                                "owner": owner,
                                "id": identity,
                            }
                        ),
                    }
                },
            ]
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        return response(
            409, {"error": "Run selection changed concurrently. Retry the same request."}
        )
    return response(202, view(run))


def save(table, run, previous):
    run["revision"] = str(uuid.uuid4())
    table.put_item(
        Item=run,
        ConditionExpression="revision = :previous",
        ExpressionAttributeValues={":previous": previous},
    )


def finish(table, owner, run, status, message):
    locks_key = {"pk": f"H#{owner}", "sk": "SIMLOCKS"}
    locks = table.get_item(Key=locks_key, ConsistentRead=True).get("Item", {})
    previous = run["revision"]
    run = {**run, "status": status, "message": message, "revision": str(uuid.uuid4())}
    updated = {
        **locks_key,
        "revision": str(uuid.uuid4()),
        "devices": {
            key: value for key, value in locks.get("devices", {}).items() if value != run["id"]
        },
    }
    boto3.client("dynamodb").transact_write_items(
        TransactItems=[
            {
                "Put": {
                    "TableName": table.name,
                    "Item": attrs(run),
                    "ConditionExpression": "revision = :previous",
                    "ExpressionAttributeValues": attrs({":previous": previous}),
                }
            },
            {
                "Put": {
                    "TableName": table.name,
                    "Item": attrs(updated),
                    "ConditionExpression": "revision = :previous",
                    "ExpressionAttributeValues": attrs({":previous": locks.get("revision", "")}),
                }
            },
            {
                "Delete": {
                    "TableName": table.name,
                    "Key": attrs({"pk": "SIMRUNS", "sk": owner + "#" + run["id"]}),
                }
            },
        ]
    )
    return run


def command(table, owner, identity, body):
    identity = str(uuid.UUID(identity))
    run = get_run(table, owner, identity)
    if not run:
        return response(404, {"error": "Run not found"})
    action = body.get("action")
    if action not in {"stop", "resume"}:
        raise ValueError("Choose stop or resume")
    if run["status"] in {"completed", "stopped"}:
        return response(200, view(run))
    try:
        if action == "stop":
            run = finish(
                table,
                owner,
                run,
                "stopped",
                "Generation stopped. Accepted/in-flight events remain; this does not clear alarms or resolve incidents.",
            )
        else:
            previous = run["revision"]
            run.update(
                status="running",
                message="Resuming pending deliveries with the same event identities.",
            )
            save(table, run, previous)
    except ClientError as exc:
        if exc.response["Error"]["Code"] not in {
            "ConditionalCheckFailedException",
            "TransactionCanceledException",
        }:
            raise
        return response(409, {"error": "Run changed. Refresh before retrying."})
    return response(200, view(run))


def work(table, owner, run, deliver, remaining):
    for incident in run["incident_ids"]:
        summary = table.get_item(
            Key={"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}, ConsistentRead=True
        ).get("Item", {})
        if (
            summary.get("resolved_at")
            or summary.get("deletion_started_at")
            or deleted(table, owner, incident)
        ):
            finish(
                table,
                owner,
                run,
                "stopped",
                "Incident resolved/deleted. Remaining synthetic generation cancelled; no automatic clear was invented.",
            )
            return
    if run["status"] != "running":
        return
    processed = 0
    order = list(range(int(run.get("cursor", 0)), len(run["rows"]))) + list(
        range(int(run.get("cursor", 0)))
    )
    for position in order:
        row = run["rows"][position]
        if remaining() < 25000 or processed >= 20:
            break
        if row["index"] >= expected_count(row["profile"]):
            continue
        offset, state = scheduled_state(row["profile"], int(row["index"]))
        scheduled = run["created_at"] + offset
        if scheduled > int(time.time()):
            continue
        if not row.get("pending"):
            identity = str(uuid.uuid5(uuid.UUID(run["id"]), f"{row['deviceId']}:{row['index']}"))
            row["pending"] = {
                "contract_version": "1.1",
                "state": state,
                "adapter": "webhook",
                "event": {
                    "event_id": identity,
                    "household_id": owner,
                    "occurred_at": datetime.fromtimestamp(int(scheduled), timezone.utc).isoformat(),
                    "source": {
                        "source_id": row["deviceId"],
                        "category": row["category"],
                        "simulated": True,
                    },
                    "kind": row["kind"],
                    "observation": row["observation"]
                    or f"Synthetic {row['kind']} state: {state['alarm']}",
                },
            }
            if row.get("incident_id") or run.get("target"):
                row["pending"]["incident_id"] = row.get("incident_id") or run["target"]
            save(table, run, run["revision"])
        result = deliver(owner, row["pending"])
        body = json.loads(result["body"])
        processed += 1
        previous = run["revision"]
        run["cursor"] = (position + 1) % len(run["rows"])
        if body.get("incident_id") and body["incident_id"] not in run["incident_ids"]:
            run["incident_ids"].append(body["incident_id"])
        if result["statusCode"] == 202:
            row["incident_id"] = body["incident_id"]
            row["index"] += 1
            row.pop("pending", None)
            run["accepted"] += 1
            run["message"] = f"{run['accepted']} of {run['expected']} scheduled signals published."
        else:
            run.update(
                status="paused",
                message=f"{row['device_name']}: {body.get('error', 'Delivery unavailable')}. Remaining signals, including any clear, are pending. Review then resume or stop.",
            )
        save(table, run, previous)
        if run["status"] != "running":
            break
    if all(row["index"] >= expected_count(row["profile"]) for row in run["rows"]):
        finish(
            table,
            owner,
            run,
            "completed",
            "All scheduled signals published. Assessment and actions continue independently; incident remains open until Resolve.",
        )
