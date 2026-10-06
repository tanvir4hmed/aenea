"""Persist material, evidence-linked updates; repeated identical alarms stay quiet."""

import hashlib
import json
import uuid
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError
from incident_engine import attrs
from incident_state import snapshot, assessed_severity
from revisions import current_assessment


def record(table, owner, incident):
    partition = f"H#{owner}#I#{incident}"
    summary_key = {"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}
    summary = table.get_item(Key=summary_key, ConsistentRead=True).get("Item", {})
    if not summary or summary.get("deletion_started_at"):
        return None
    latest = (
        table.get_item(
            Key={"pk": partition, "sk": "ASSESSMENT#" + summary["latest_assessment"]},
            ConsistentRead=True,
        ).get("Item", {})
        if summary.get("latest_assessment")
        else {}
    )
    current = (
        current_assessment(summary, latest)
        and latest.get("status") == "assessed"
        and summary.get("decision_review") != "rejected"
    )
    state = snapshot(table, owner, incident)
    severity, devices = assessed_severity(state, latest.get("assessment") if current else None)
    resolved = bool(summary.get("resolved_at"))
    text = (
        "Resolved by human confirmation; this does not certify safety."
        if resolved
        else latest["assessment"]["summary"]
        if current
        else "New context is awaiting an updated assessment."
    )
    if not resolved:
        rooms = sorted({d.get("room") or "Unassigned area" for d in devices})
        text += (
            f" {len(devices)} devices reporting"
            + (
                ": " + ", ".join(rooms[:6]) + (" and additional areas" if len(rooms) > 6 else "")
                if rooms
                else ""
            )
            + "."
        )
    material = {
        "name": summary.get("name", "Incident"),
        "resolved": resolved,
        "text": text,
        "severity": "informational" if resolved else severity,
        "devices": sorted(
            (d["device_id"], d["kind"], d["alarm"], d.get("room", "")) for d in devices
        )
        if not resolved
        else [],
    }
    fingerprint = hashlib.sha256(json.dumps(material, sort_keys=True).encode()).hexdigest()
    key = {"pk": partition, "sk": "BRIEFING"}
    previous = table.get_item(Key=key, ConsistentRead=True).get("Item", {})
    unchanged = previous.get("fingerprint") == fingerprint
    item = {
        **key,
        **material,
        # Persist the read projection in the same revision-checked transaction.
        # Incident reads do not need to replay all historical events or call AI.
        "device_state": {
            "version": 1,
            "severity": state["severity"],
            "active_devices": state["active_devices"],
            "last_reported_at": state.get("last_reported_at"),
        },
        "fingerprint": fingerprint,
        "id": previous["id"] if unchanged else str(uuid.uuid4()),
        "kind": "briefing",
        "recorded_at": previous["recorded_at"]
        if unchanged
        else datetime.now(timezone.utc).isoformat(),
        "evidence_revision": summary.get("event_count", 0),
        "note_revision": summary.get("note_revision", 0),
        "assessment_id": summary.get("latest_assessment"),
        "evidence_ids": latest.get("evidence_ids", []) if current else [],
        "data": {"message": text},
    }
    check = "event_count = :revision AND attribute_not_exists(deletion_started_at) AND (note_revision = :notes OR (attribute_not_exists(note_revision) AND :notes = :zero))"
    values = {
        ":revision": summary.get("event_count", 0),
        ":notes": summary.get("note_revision", 0),
        ":zero": 0,
    }
    if "decision_review" in summary:
        check += " AND decision_review = :review"
        values[":review"] = summary["decision_review"]
    else:
        check += " AND attribute_not_exists(decision_review)"
    if summary.get("latest_assessment"):
        check += " AND latest_assessment = :assessment"
        values[":assessment"] = summary["latest_assessment"]
    else:
        check += " AND attribute_not_exists(latest_assessment)"
    if resolved:
        check += " AND resolved_at = :resolved"
        values[":resolved"] = summary["resolved_at"]
    else:
        check += " AND attribute_not_exists(resolved_at)"
    put = {
        "TableName": table.name,
        "Item": attrs(item),
        "ConditionExpression": "fingerprint = :previous"
        if previous
        else "attribute_not_exists(pk)",
    }
    if previous:
        put["ExpressionAttributeValues"] = attrs({":previous": previous["fingerprint"]})
    try:
        operations = [
            {
                "ConditionCheck": {
                    "TableName": table.name,
                    "Key": attrs(summary_key),
                    "ConditionExpression": check,
                    "ExpressionAttributeValues": attrs(values),
                }
            },
            {"Put": put},
        ]
        if not unchanged:
            operations.append(
                {
                    "Put": {
                        "TableName": table.name,
                        "Item": attrs(
                            {
                                **{
                                    key: value
                                    for key, value in item.items()
                                    if key != "device_state"
                                },
                                "sk": "AUDIT#briefing#" + item["id"],
                            }
                        ),
                    }
                }
            )
        boto3.client("dynamodb").transact_write_items(TransactItems=operations)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        return None
    return item
