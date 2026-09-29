"""Bounded display names, separate from immutable incident identities."""

import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.types import TypeSerializer

def validate_name(value: object) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 120:
        raise ValueError("Incident name must contain 1–120 characters")
    if any(ord(char) < 32 for char in value):
        raise ValueError("Incident name contains control characters")
    return value.strip()


def rename_incident(table, owner, incident, body):
    from botocore.exceptions import ClientError
    from common import response
    if not isinstance(body, dict) or set(body) != {"name"}:
        raise ValueError("Expected an incident name")
    name = validate_name(body["name"])
    serialize = TypeSerializer()
    attrs = lambda value: {key: serialize.serialize(item) for key, item in value.items()}
    try:
        boto3.client("dynamodb").transact_write_items(TransactItems=[
            {"Update": {"TableName": table.name,
                "Key": attrs({"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}),
                "UpdateExpression": "SET #name = :name",
                "ConditionExpression": "attribute_exists(pk) AND attribute_not_exists(deletion_started_at)",
                "ExpressionAttributeNames": {"#name": "name"}, "ExpressionAttributeValues": attrs({":name": name})}},
            {"Put": {"TableName": table.name, "Item": attrs({"pk": f"H#{owner}#I#{incident}",
                "sk": "AUDIT#renamed#" + str(uuid.uuid4()), "kind": "renamed",
                "recorded_at": datetime.now(timezone.utc).isoformat(), "data": {"actor": owner, "name": name}})}}])
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        return response(409, {"error": "Incident unavailable; refresh before renaming"})
    return response(200, {"incident_id": incident, "name": name})
