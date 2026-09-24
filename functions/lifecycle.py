"""Deletion markers survive cleanup to reject late event/workflow replays."""
import time

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

from common import response


def marker_key(owner, incident):
    return {"pk": f"H#{owner}", "sk": "DELETED#" + incident}


def deleted(table, owner, incident):
    item = table.get_item(Key=marker_key(owner, incident), ConsistentRead=True).get("Item")
    return item if isinstance(item, dict) and item.get("cleanup_status") else None


def require_active(table, owner, incident):
    if deleted(table, owner, incident):
        raise ValueError("Incident is being deleted or has been deleted")


def request_deletion(table, owner, incident, body):
    if body != {"confirm_incident_id": incident}:
        return response(400, {"error": "Type the complete incident ID to confirm deletion"})
    previous = deleted(table, owner, incident)
    if previous:
        return response(200, previous)
    now = int(time.time())
    marker = {**marker_key(owner, incident), "incident_id": incident,
              "requested_at": now, "eligible_at": now + 900, "cleanup_status": "pending"}
    serializer = TypeSerializer()
    attrs = lambda value: {key: serializer.serialize(item) for key, item in value.items()}
    try:
        boto3.client("dynamodb").transact_write_items(TransactItems=[
            {"Put": {"TableName": table.name, "Item": attrs(marker), "ConditionExpression": "attribute_not_exists(pk)"}},
            {"Update": {"TableName": table.name,
                "Key": attrs({"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}),
                "UpdateExpression": "SET deletion_started_at = :now, #s = :status",
                "ConditionExpression": "attribute_exists(pk)",
                "ExpressionAttributeNames": {"#s": "status"},
                "ExpressionAttributeValues": attrs({":now": now, ":status": "deleting"})}},
            {"Put": {"TableName": table.name, "Item": attrs({"pk": "CLEANUP", "sk": f"JOB#{owner}#{incident}",
                "owner": owner, "incident_id": incident, "eligible_at": now + 900})}},
        ])
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        previous = deleted(table, owner, incident)
        return response(200, previous) if previous else response(409, {"error": "Incident not found or changed; refresh before deleting"})
    return response(202, marker)
