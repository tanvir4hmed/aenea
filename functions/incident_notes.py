"""Attributed optional notes, separate from sensor evidence and person entities."""

import json
import os
import uuid
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from common import response
from incident_engine import attrs


def latest_notes(table, owner, incident):
    rows, count = [], 0
    query = {
        "KeyConditionExpression": Key("pk").eq(f"H#{owner}#I#{incident}")
        & Key("sk").begins_with("NOTE#"),
        "ConsistentRead": True,
        "Limit": 50,
    }
    while True:
        page = table.query(**query)
        count += len(page["Items"])
        rows = sorted(rows + page["Items"], key=lambda row: row["recorded_at"], reverse=True)[:8]
        if not page.get("LastEvaluatedKey"):
            return {"items": rows, "total": count, "partial": count > len(rows)}
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def save_note(table, owner, incident, body):
    if (
        not isinstance(body, dict)
        or set(body) != {"request_id", "text"}
        or not isinstance(body["text"], str)
        or not 1 <= len(body["text"].strip()) <= 1000
    ):
        raise ValueError("Write an optional note of 1–1,000 characters")
    identity = str(uuid.UUID(body["request_id"]))
    key = {"pk": f"H#{owner}#I#{incident}", "sk": "NOTE#" + identity}
    item = {
        **key,
        "kind": "note",
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "data": {"text": body["text"].strip(), "reported_by": owner, "unverified": True},
    }
    existing = table.get_item(Key=key, ConsistentRead=True).get("Item")
    if existing and existing["data"]["text"] != item["data"]["text"]:
        raise ValueError("Note identity already used; start a new note")
    if not existing:
        try:
            boto3.client("dynamodb").transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": table.name,
                            "Item": attrs(item),
                            "ConditionExpression": "attribute_not_exists(pk)",
                        }
                    },
                    {
                        "Update": {
                            "TableName": table.name,
                            "Key": attrs({"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}),
                            "UpdateExpression": "ADD note_revision :one",
                            "ConditionExpression": "attribute_exists(pk) AND attribute_not_exists(resolved_at) AND attribute_not_exists(deletion_started_at)",
                            "ExpressionAttributeValues": attrs({":one": 1}),
                        }
                    },
                ]
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "TransactionCanceledException":
                raise
            existing = table.get_item(Key=key, ConsistentRead=True).get("Item")
            if not existing or existing["data"]["text"] != item["data"]["text"]:
                return response(
                    409, {"error": "Incident changed or closed; refresh before adding a note"}
                )
    result = boto3.client("events").put_events(
        Entries=[
            {
                "EventBusName": os.environ["EVENT_BUS"],
                "Source": "aenea.ingress",
                "DetailType": "IncidentEvent",
                "Detail": json.dumps(
                    {
                        "assessment_only": True,
                        "household_id": owner,
                        "incident_id": incident,
                        "event_id": identity,
                    }
                ),
            }
        ]
    )
    return response(
        503 if result.get("FailedEntryCount") else 200,
        {
            "saved": True,
            "text": item["data"]["text"],
            "error": "Note saved; reassessment publication pending. Retry this same note."
            if result.get("FailedEntryCount")
            else None,
        },
    )
