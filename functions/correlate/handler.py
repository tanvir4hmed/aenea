"""Idempotently append evidence and update one incident aggregate in a transaction."""

import os
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError
from incidentbridge import idempotency_key, validate_event
from incident_names import validate_name
from event_contract import historical_context

client = boto3.client("dynamodb")
serializer = TypeSerializer()


def attributes(values):
    return {key: serializer.serialize(value) for key, value in values.items()}


def handler(detail, context):
    if detail.get("assessment_only"):
        return {
            "household_id": detail["household_id"],
            "incident_id": str(uuid.UUID(detail["incident_id"])),
            "event_id": detail["event_id"],
            "deleted": False,
        }
    event = validate_event(detail["event"])
    incident_id = str(uuid.UUID(detail["incident_id"]))
    owner = event.household_id
    event_key = idempotency_key(event)
    if detail["idempotency_key"] != event_key or not event.source.simulated:
        raise ValueError("Invalid event provenance")
    timeline_key = {
        "pk": f"H#{owner}#I#{incident_id}",
        "sk": f"EVENT#{event.occurred_at.isoformat()}#{event_key}",
    }
    summary_key = {"pk": f"H#{owner}", "sk": f"INCIDENT#{incident_id}"}
    site = (detail.get("event_context") or {}).get("location", {}).get("id")
    site_updates = (
        [
            {
                "Update": {
                    "TableName": os.environ["STATE_TABLE"],
                    "Key": attributes({"pk": f"H#{owner}", "sk": "SITE#" + site}),
                    "UpdateExpression": "ADD revision :one",
                    "ExpressionAttributeValues": attributes({":one": 1}),
                }
            }
        ]
        if site
        else []
    )
    try:
        client.transact_write_items(
            TransactItems=[
                {
                    "ConditionCheck": {
                        "TableName": os.environ["STATE_TABLE"],
                        "Key": attributes({"pk": f"H#{owner}", "sk": "DELETED#" + incident_id}),
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
                {
                    "Put": {
                        "TableName": os.environ["STATE_TABLE"],
                        "Item": attributes(
                            {
                                **timeline_key,
                                "event": event.model_dump(mode="json"),
                                "event_context": historical_context(detail),
                                "routing": detail.get("routing"),
                                "evidence_key": detail["evidence_key"],
                            }
                        ),
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
                {
                    "Update": {
                        "TableName": os.environ["STATE_TABLE"],
                        "Key": attributes(summary_key),
                        "UpdateExpression": (
                            "SET incident_id = :id, #status = :status, updated_at = :now, #name = if_not_exists(#name, :name), "
                            "created_at = if_not_exists(created_at, :time), "
                            "event_count = if_not_exists(event_count, :zero) + :one"
                        ),
                        "ConditionExpression": "attribute_not_exists(resolved_at) AND attribute_not_exists(deletion_started_at)",
                        "ExpressionAttributeNames": {"#status": "status", "#name": "name"},
                        "ExpressionAttributeValues": attributes(
                            {
                                ":id": incident_id,
                                ":status": "collecting_evidence",
                                ":name": validate_name(
                                    detail.get(
                                        "incident_name", "Simulated " + event.kind.replace("_", " ")
                                    )
                                ),
                                ":time": event.occurred_at.isoformat(),
                                ":zero": 0,
                                ":one": 1,
                                ":now": datetime.now(timezone.utc).isoformat(),
                            }
                        ),
                    }
                },
            ]
            + site_updates
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        if "Item" in client.get_item(
            TableName=os.environ["STATE_TABLE"],
            Key=attributes({"pk": f"H#{owner}", "sk": "DELETED#" + incident_id}),
            ConsistentRead=True,
        ):
            return {"household_id": owner, "incident_id": incident_id, "deleted": True}
        existing = client.get_item(
            TableName=os.environ["STATE_TABLE"], Key=attributes(timeline_key), ConsistentRead=True
        )
        if "Item" not in existing:
            summary = client.get_item(
                TableName=os.environ["STATE_TABLE"],
                Key=attributes(summary_key),
                ConsistentRead=True,
            ).get("Item", {})
            if "resolved_at" not in summary:
                raise
            # Accepted before resolution but delivered afterward: archive, never reopen.
            try:
                client.transact_write_items(
                    TransactItems=[
                        {
                            "ConditionCheck": {
                                "TableName": os.environ["STATE_TABLE"],
                                "Key": attributes(
                                    {"pk": f"H#{owner}", "sk": "DELETED#" + incident_id}
                                ),
                                "ConditionExpression": "attribute_not_exists(pk)",
                            }
                        },
                        {
                            "Put": {
                                "TableName": os.environ["STATE_TABLE"],
                                "Item": attributes(
                                    {
                                        **timeline_key,
                                        "event": event.model_dump(mode="json"),
                                        "event_context": historical_context(detail),
                                        "evidence_key": detail["evidence_key"],
                                        "late_after_resolution": True,
                                    }
                                ),
                                "ConditionExpression": "attribute_not_exists(pk)",
                            }
                        },
                    ]
                )
            except ClientError as late:
                if late.response["Error"]["Code"] != "TransactionCanceledException":
                    raise
            return {"household_id": owner, "incident_id": incident_id, "deleted": True}
        # A retry after a successful transaction must not increment the aggregate twice.
    return {
        "household_id": owner,
        "incident_id": incident_id,
        "event_id": event.event_id,
        "status": "collecting_evidence",
        "deleted": False,
    }
