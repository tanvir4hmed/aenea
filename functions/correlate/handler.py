"""Idempotently append evidence and update one incident aggregate in a transaction."""
import os
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError
from incidentbridge import idempotency_key, validate_event

client = boto3.client("dynamodb")
serializer = TypeSerializer()


def attributes(values):
    return {key: serializer.serialize(value) for key, value in values.items()}


def handler(detail, context):
    event = validate_event(detail["event"])
    incident_id = str(uuid.UUID(detail["incident_id"]))
    owner = event.household_id
    event_key = idempotency_key(event)
    if detail["idempotency_key"] != event_key or not event.source.simulated:
        raise ValueError("Invalid event provenance")
    timeline_key = {
        "pk": f"H#{owner}#I#{incident_id}", "sk": f"EVENT#{event.occurred_at.isoformat()}#{event_key}"
    }
    summary_key = {"pk": f"H#{owner}", "sk": f"INCIDENT#{incident_id}"}
    try:
        client.transact_write_items(TransactItems=[
            {"Put": {
                "TableName": os.environ["STATE_TABLE"],
                "Item": attributes({**timeline_key, "event": event.model_dump(mode="json"),
                                    "evidence_key": detail["evidence_key"]}),
                "ConditionExpression": "attribute_not_exists(pk)",
            }},
            {"Update": {
                "TableName": os.environ["STATE_TABLE"],
                "Key": attributes(summary_key),
                "UpdateExpression": (
                    "SET incident_id = :id, #status = :status, updated_at = :now, "
                    "created_at = if_not_exists(created_at, :time), "
                    "event_count = if_not_exists(event_count, :zero) + :one"
                ),
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": attributes({
                    ":id": incident_id, ":status": "collecting_evidence",
                    ":time": event.occurred_at.isoformat(), ":zero": 0, ":one": 1,
                    ":now": datetime.now(timezone.utc).isoformat(),
                }),
            }},
        ])
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        existing = client.get_item(TableName=os.environ["STATE_TABLE"],
                                   Key=attributes(timeline_key), ConsistentRead=True)
        if "Item" not in existing:
            raise
        # A retry after a successful transaction must not increment the aggregate twice.
    return {"household_id": owner, "incident_id": incident_id, "event_id": event.event_id,
            "status": "collecting_evidence"}
