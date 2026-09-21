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

table = boto3.resource("dynamodb").Table(table_name())
serializer = TypeSerializer()


def native(value):
    return json.loads(json.dumps(value, default=float), parse_float=Decimal)


def attrs(value):
    return {k: serializer.serialize(v) for k, v in native(value).items()}


def partition(owner, incident):
    return f"H#{owner}#I#{incident}"


def get(owner, incident, key):
    return table.get_item(Key={"pk": partition(owner, incident), "sk": key},
                          ConsistentRead=True).get("Item")


def evidence(owner, incident):
    query = {"KeyConditionExpression": Key("pk").eq(partition(owner, incident)) &
             Key("sk").begins_with("EVENT#"), "ScanIndexForward": False,
             "Limit": 200, "ConsistentRead": True}
    result = table.query(**query)
    # Fail closed rather than silently overlooking smoke behind a truncated evidence page.
    if result.get("LastEvaluatedKey"):
        raise ValueError("Incident evidence exceeds demo policy budget; review required")
    return [item["event"] for item in result["Items"]]


def profile(owner):
    return table.get_item(Key={"pk": f"H#{owner}", "sk": "PROFILE"},
                          ConsistentRead=True).get("Item", {"revision": "unconfigured", "devices": {}})


def audit_item(owner, incident, kind, identity, payload):
    return {"pk": partition(owner, incident), "sk": f"AUDIT#{kind}#{identity}",
            "kind": kind, "recorded_at": datetime.now(timezone.utc).isoformat(),
            "simulated": True, "data": native(payload)}


def audit(owner, incident, kind, identity, payload):
    item = audit_item(owner, incident, kind, identity, payload)
    try:
        table.put_item(Item=item, ConditionExpression="attribute_not_exists(pk)")
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise


def action_id(incident, proposal):
    # Same virtual command is issued at most once per incident, across evidence updates.
    return hashlib.sha256(f"{incident}:{proposal['device_id']}:{proposal['action']}".encode()).hexdigest()[:32]


def execute(owner, incident, identifier, confirmed=False):
    item = get(owner, incident, "ACTION#" + identifier)
    if not item:
        raise KeyError("Unknown action")
    if item["status"] in {"succeeded", "failed", "blocked", "expired"}:
        return item
    if item["status"] == "pending_confirmation" and not confirmed:
        return item
    current = profile(owner)
    summary_key = {"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"}
    revision = table.get_item(Key=summary_key, ConsistentRead=True)["Item"]["event_count"]
    state, reason = decision(item["proposal"], evidence(owner, incident), current,
                             int(time.time()), int(item["expires_at"]), confirmed)
    device = current.get("devices", {}).get(item["proposal"]["device_id"], {})
    if state == "allowed":
        state = "failed" if device.get("fail_next") is True else "succeeded"
        reason = "Simulated device failure" if state == "failed" else "Virtual device state updated"
    updated = {**item, "status": state, "result": reason, "confirmed": confirmed}
    if state == "failed":
        updated["alternate_plan"] = "Device unavailable; request a household check-in and review the incident. No physical action was taken."
    operations = [
        {"ConditionCheck": {"TableName": table_name(), "Key": attrs(summary_key),
            "ConditionExpression": "event_count = :revision",
            "ExpressionAttributeValues": attrs({":revision": revision})}},
        {"ConditionCheck": {"TableName": table_name(),
            "Key": attrs({"pk": f"H#{owner}", "sk": "PROFILE"}),
            "ConditionExpression": "revision = :revision",
            "ExpressionAttributeValues": attrs({":revision": current["revision"]})}},
        {"Put": {"TableName": table_name(), "Item": attrs(updated),
            "ConditionExpression": "#s = :previous AND assessment_id = :assessment",
            "ExpressionAttributeNames": {"#s": "status"},
            "ExpressionAttributeValues": attrs({":previous": item["status"], ":assessment": item["assessment_id"]})}},
        {"Put": {"TableName": table_name(), "Item": attrs(audit_item(
            owner, incident, "action_result", identifier + ":" + item["assessment_id"], updated)),
            "ConditionExpression": "attribute_not_exists(pk)"}},
    ]
    if state == "succeeded":
        operations.append({"Put": {"TableName": table_name(), "Item": attrs({
            "pk": f"H#{owner}", "sk": "DEVICE#" + item["proposal"]["device_id"],
            "state": item["proposal"]["action"], "simulated": True,
            "incident_id": incident, "action_id": identifier})}})
    if state == "failed":
        operations.append({"Update": {"TableName": table_name(),
            "Key": attrs({"pk": f"H#{owner}", "sk": "PROFILE"}),
            "UpdateExpression": "SET devices.#device.fail_next = :false, revision = :next_revision",
            "ExpressionAttributeNames": {"#device": item["proposal"]["device_id"]},
            "ExpressionAttributeValues": attrs({":false": False, ":next_revision": str(uuid.uuid4())})}})
        # A transaction cannot both check and update the same profile item.
        check = operations.pop(1)["ConditionCheck"]
        operations[-1]["Update"].update({k: check[k] for k in ["ConditionExpression"]})
        operations[-1]["Update"]["ExpressionAttributeValues"].update(check["ExpressionAttributeValues"])
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
