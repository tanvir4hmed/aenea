"""Tenant-scoped persistence and atomic simulated actions."""

import hashlib
import json
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

from common import table_name
from safety import decision
from revisions import actionable
from lifecycle import deleted
from incident_state import snapshot
from catalog import read_catalog, ACTUATORS
from action_context import location_evidence
from runtime_capabilities import device_actions_enabled

table = boto3.resource("dynamodb").Table(table_name())
serializer = TypeSerializer()


def native(value):
    return json.loads(json.dumps(value, default=float), parse_float=Decimal)


def attrs(value):
    return {k: serializer.serialize(v) for k, v in native(value).items()}


def partition(owner, incident):
    return f"H#{owner}#I#{incident}"


def get(owner, incident, key):
    return table.get_item(
        Key={"pk": partition(owner, incident), "sk": key}, ConsistentRead=True
    ).get("Item")


def evidence(owner, incident):
    return snapshot(table, owner, incident)["policy_events"]


def profile(owner):
    saved = table.get_item(Key={"pk": f"H#{owner}", "sk": "PROFILE"}, ConsistentRead=True).get(
        "Item", {"revision": "unconfigured", "devices": {}}
    )
    catalog = read_catalog(table, owner)
    devices = {}
    for device in catalog["devices"]:
        if device["type"] not in ACTUATORS:
            continue
        settings = saved.get("devices", {}).get(device["id"], {})
        devices[device["id"]] = {
            "enabled": bool(device["enabled"] and settings.get("enabled")),
            "preauthorized": settings.get("preauthorized") is True,
            "fail_next": settings.get("fail_next") is True,
            "simulated": True,
            "location_id": device["location_id"],
            "capability": ACTUATORS[device["type"]],
            "name": device["name"],
        }
    return {**saved, "devices": devices, "catalog_revision": catalog["revision"]}


def audit_item(owner, incident, kind, identity, payload):
    return {
        "pk": partition(owner, incident),
        "sk": f"AUDIT#{kind}#{identity}",
        "kind": kind,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "simulated": True,
        "data": native(payload),
    }


def audit(owner, incident, kind, identity, payload):
    item = audit_item(owner, incident, kind, identity, payload)
    try:
        table.put_item(Item=item, ConditionExpression="attribute_not_exists(pk)")
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise


def action_id(incident, proposal):
    # Same virtual command is issued at most once per incident, across evidence updates.
    return hashlib.sha256(
        f"{incident}:{proposal['device_id']}:{proposal['action']}".encode()
    ).hexdigest()[:32]


def execute(owner, incident, identifier, confirmed=False, expected_assessment=None):
    if not device_actions_enabled():
        return {
            "action_id": identifier,
            "status": "blocked",
            "result": "Device response controls have been retired. No action performed.",
            "execution_performed": False,
        }
    if deleted(table, owner, incident):
        return {
            "action_id": identifier,
            "status": "deleted",
            "result": "Incident deleted; no execution performed",
            "execution_performed": False,
        }
    item = get(owner, incident, "ACTION#" + identifier)
    if not item:
        raise KeyError("Unknown action")
    if expected_assessment is not None and item["assessment_id"] != expected_assessment:
        return {
            **item,
            "status": "superseded",
            "result": "Assessment changed since approval. Read and confirm the new proposal.",
            "execution_performed": False,
        }
    if item["status"] in {"succeeded", "failed", "blocked", "expired"}:
        return item
    current = profile(owner)
    summary_key = {"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"}
    summary = table.get_item(Key=summary_key, ConsistentRead=True)["Item"]
    revision = summary["event_count"]
    assessment = get(owner, incident, "ASSESSMENT#" + item["assessment_id"])
    if not actionable(summary, assessment) or item.get("evidence_revision") != revision:
        return {
            **item,
            "status": "superseded",
            "result": "New evidence or a rejected review prevents this action. Review the current assessment.",
            "execution_performed": False,
        }
    if item["status"] == "pending_confirmation" and not confirmed:
        return item
    policy_events = evidence(owner, incident)
    site_guard = None
    if item["proposal"].get("location_id") and item["proposal"]["action"] == "close_valve":
        policy_events, site_key, site_epoch = location_evidence(
            table, owner, item["proposal"]["location_id"]
        )
        site_guard = {
            "ConditionCheck": {
                "TableName": table_name(),
                "Key": attrs(site_key),
                "ConditionExpression": "revision = :epoch",
                "ExpressionAttributeValues": attrs({":epoch": site_epoch}),
            }
        }
    state, reason = decision(
        item["proposal"],
        policy_events,
        current,
        int(time.time()),
        int(item["expires_at"]),
        confirmed,
    )
    device = current.get("devices", {}).get(item["proposal"]["device_id"], {})
    if state == "allowed":
        state = "failed" if device.get("fail_next") is True else "succeeded"
        reason = "Simulated device failure" if state == "failed" else "Virtual device state updated"
    updated = {**item, "status": state, "result": reason, "confirmed": confirmed}
    if state == "failed":
        updated["alternate_plan"] = (
            "Device unavailable. Review the recorded failure and official alarms; no physical action was taken."
        )
    operations = [
        {
            "ConditionCheck": {
                "TableName": table_name(),
                "Key": attrs(summary_key),
                "ConditionExpression": "attribute_not_exists(resolved_at) AND attribute_not_exists(deletion_started_at) AND event_count = :revision AND (note_revision = :notes OR (attribute_not_exists(note_revision) AND :notes = :zero)) AND latest_assessment = :assessment AND (attribute_not_exists(decision_review) OR decision_review <> :rejected)",
                "ExpressionAttributeValues": attrs(
                    {
                        ":revision": revision,
                        ":notes": assessment.get("note_revision", 0),
                        ":zero": 0,
                        ":assessment": item["assessment_id"],
                        ":rejected": "rejected",
                    }
                ),
            }
        },
        {
            "ConditionCheck": {
                "TableName": table_name(),
                "Key": attrs({"pk": f"H#{owner}", "sk": "PROFILE"}),
                "ConditionExpression": "revision = :revision",
                "ExpressionAttributeValues": attrs({":revision": current["revision"]}),
            }
        },
        {
            "Put": {
                "TableName": table_name(),
                "Item": attrs(updated),
                "ConditionExpression": "#s = :previous AND assessment_id = :assessment",
                "ExpressionAttributeNames": {"#s": "status"},
                "ExpressionAttributeValues": attrs(
                    {":previous": item["status"], ":assessment": item["assessment_id"]}
                ),
            }
        },
        {
            "Put": {
                "TableName": table_name(),
                "Item": attrs(
                    audit_item(
                        owner,
                        incident,
                        "action_result",
                        identifier + ":" + item["assessment_id"],
                        updated,
                    )
                ),
                "ConditionExpression": "attribute_not_exists(pk)",
            }
        },
    ]
    if current.get("catalog_revision"):
        operations.append(
            {
                "ConditionCheck": {
                    "TableName": table_name(),
                    "Key": attrs({"pk": f"H#{owner}", "sk": "CATALOG"}),
                    "ConditionExpression": "revision = :revision",
                    "ExpressionAttributeValues": attrs({":revision": current["catalog_revision"]}),
                }
            }
        )
    if site_guard:
        operations.append(site_guard)
    if state == "succeeded":
        operations.append(
            {
                "Put": {
                    "TableName": table_name(),
                    "Item": attrs(
                        {
                            "pk": f"H#{owner}",
                            "sk": "DEVICE#" + item["proposal"]["device_id"],
                            "state": item["proposal"]["action"],
                            "simulated": True,
                            "incident_id": incident,
                            "action_id": identifier,
                        }
                    ),
                }
            }
        )
    if state == "failed":
        operations.append(
            {
                "Update": {
                    "TableName": table_name(),
                    "Key": attrs({"pk": f"H#{owner}", "sk": "PROFILE"}),
                    "UpdateExpression": "SET devices.#device.fail_next = :false, revision = :next_revision",
                    "ExpressionAttributeNames": {"#device": item["proposal"]["device_id"]},
                    "ExpressionAttributeValues": attrs(
                        {":false": False, ":next_revision": str(uuid.uuid4())}
                    ),
                }
            }
        )
        # A transaction cannot both check and update the same profile item.
        check = operations.pop(1)["ConditionCheck"]
        operations[-1]["Update"].update({k: check[k] for k in ["ConditionExpression"]})
        operations[-1]["Update"]["ExpressionAttributeValues"].update(
            check["ExpressionAttributeValues"]
        )
    try:
        boto3.client("dynamodb").transact_write_items(TransactItems=operations)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        latest = get(owner, incident, "ACTION#" + identifier)
        if latest["status"] in {"succeeded", "failed", "blocked", "expired"}:
            return latest
        raise  # A concurrent settings change must be re-evaluated on retry.
    return updated
