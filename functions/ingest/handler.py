"""Authenticated simulator ingress with retryable publication and conflict detection."""
import base64
import json
import os
import uuid

import boto3
from botocore.exceptions import ClientError
from incidentbridge import InvalidEvent, idempotency_key, normalize_event, payload_digest

from common import household, response, table_name

table = boto3.resource("dynamodb").Table(table_name())
s3 = boto3.client("s3")
events = boto3.client("events")


def handler(request, context):
    try:
        owner = household(request)
        if os.environ.get("INGESTION_ENABLED", "true") != "true":
            return response(503, {"error": "New simulated signals are paused by the operator; no event accepted"})
        raw = request.get("body") or ""
        if request.get("isBase64Encoded"):
            raw = base64.b64decode(raw, validate=True).decode("utf-8")
        if len(raw.encode()) > 16000:
            return response(413, {"error": "Event is too large"})
        payload = json.loads(raw)
        if not isinstance(payload, dict) or set(payload) - {"incident_id", "event", "adapter"}:
            return response(400, {"error": "Expected incident_id, event and optional adapter"})
        incident_id = str(uuid.UUID(payload["incident_id"]))
        event = normalize_event(payload["event"], payload.get("adapter", "webhook"))
        if event.household_id != owner:
            return response(403, {"error": "Household does not belong to this identity"})
        if not event.source.simulated:
            return response(400, {"error": "This demo accepts simulated signals only"})
        key = idempotency_key(event)
        digest = payload_digest(event)
        item_key = {"pk": f"H#{owner}", "sk": f"INGEST#{key}"}
        try:
            table.put_item(
                Item={**item_key, "digest": digest, "incident_id": incident_id, "status": "pending"},
                ConditionExpression="attribute_not_exists(pk)",
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise
            existing = table.get_item(Key=item_key, ConsistentRead=True)["Item"]
            if existing["digest"] != digest or existing["incident_id"] != incident_id:
                return response(409, {"error": "Event identity already used with different content"})
            if existing["status"] == "published":
                return response(202, {"incident_id": incident_id, "event_id": event.event_id,
                                      "duplicate": True})
        evidence_key = f"{owner}/{incident_id}/{key}.json"
        s3.put_object(
            Bucket=os.environ["EVIDENCE_BUCKET"], Key=evidence_key,
            Body=event.model_dump_json().encode(), ContentType="application/json",
            ServerSideEncryption="AES256",
        )
        result = events.put_events(Entries=[{
            "EventBusName": os.environ["EVENT_BUS"],
            "Source": "aenea.ingress",
            "DetailType": "IncidentEvent",
            "Detail": json.dumps({"incident_id": incident_id, "event": event.model_dump(mode="json"),
                                  "idempotency_key": key, "evidence_key": evidence_key}),
        }])
        if result.get("FailedEntryCount"):
            return response(503, {"error": "Publication pending; retry the same event ID and payload"})
        table.update_item(Key=item_key, UpdateExpression="SET #status = :published",
                          ExpressionAttributeNames={"#status": "status"},
                          ExpressionAttributeValues={":published": "published"})
        return response(202, {"incident_id": incident_id, "event_id": event.event_id,
                              "duplicate": False})
    except PermissionError:
        return response(401, {"error": "Authentication required"})
    except (InvalidEvent, ValueError, KeyError, TypeError, UnicodeError):
        return response(400, {"error": "Invalid incident event"})
