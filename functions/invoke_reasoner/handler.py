"""Revision-checked assessment over bounded context, with complete state for policy."""

import hashlib
import json
import os
import time
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from assessment import IncidentAssessment
from coordination import audit, get, native, partition, table
from incident_state import snapshot
from revisions import actionable
from lifecycle import deleted
from incident_notes import latest_notes
from briefings import record as record_briefing
from model_context import bounded_payload

runtime = boto3.client(
    "bedrock-agentcore",
    config=Config(connect_timeout=5, read_timeout=150, retries={"total_max_attempts": 1}),
)


def reused_assessment(previous, events):
    identities = {(e["source"]["source_id"], e["kind"]): e["event_id"] for e in events}
    replacements = {
        e["event_id"]: identities.get((e["source"]["source_id"], e["kind"]))
        for e in previous["evidence_snapshot"]
    }
    body = json.loads(json.dumps(previous["assessment"], default=float))
    for target in [body, *body["actions"]]:
        target["evidence_ids"] = [replacements.get(identity) for identity in target["evidence_ids"]]
    return IncidentAssessment.model_validate(body).check_evidence(events)


def handler(event, context):
    owner, incident = event["household_id"], event["incident_id"]
    event = {**event, "assessment_attempt": int(event.get("assessment_attempt", 0)) + 1}
    summary_key = {"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"}
    summary = table.get_item(Key=summary_key, ConsistentRead=True).get("Item", {})
    if deleted(table, owner, incident) or summary.get("resolved_at") or not summary:
        return {**event, "reasoner_ok": False, "retry_needed": False}
    revision = summary["event_count"]
    note_revision = summary.get("note_revision", 0)
    previous = (
        get(owner, incident, "ASSESSMENT#" + summary["latest_assessment"])
        if summary.get("latest_assessment")
        else None
    )
    event["replaces_assessment"] = summary.get("latest_assessment", "")
    if actionable(summary, previous) and previous.get("expires_at", 0) > int(time.time()):
        return {
            **event,
            "assessment_id": previous["assessment_id"],
            "reasoner_ok": True,
            "retry_needed": False,
        }
    identifier = hashlib.sha256(
        f"{event['event_id']}:{revision}:{note_revision}:{event['assessment_attempt']}".encode()
    ).hexdigest()[:32]
    failure_code = "snapshot_unavailable"
    state = None
    try:
        state = snapshot(table, owner, incident)
        notes = (
            latest_notes(table, owner, incident)
            if note_revision
            else {"items": [], "partial": False, "total": 0}
        )
        if note_revision:
            state["fingerprint"] = hashlib.sha256(
                f"{state['fingerprint']}:{note_revision}".encode()
            ).hexdigest()
        after = table.get_item(Key=summary_key, ConsistentRead=True).get("Item", {})
        if (
            revision != after.get("event_count")
            or note_revision != after.get("note_revision", 0)
            or after.get("resolved_at")
        ):
            failure_code = "snapshot_changed"
            raise ValueError("Evidence changed during snapshot")
        events = state["events"]
        if not events:
            raise ValueError("No evidence available")
        failure_code = "reasoner_unavailable_or_invalid"
        from safety import DEVICES

        payload = bounded_payload(events, state["context"], notes, DEVICES)
        events = payload["events"]
        state["context"] = payload["state_summary"]

        coalesced = False
        if (
            previous
            and summary.get("decision_review") != "rejected"
            and previous.get("status") == "assessed"
            and previous.get("state_fingerprint") == state["fingerprint"]
            and previous.get("expires_at", 0) > int(time.time()) + 30
        ):
            try:
                assessment = reused_assessment(previous, events)
                body = {"model_id": previous["model_id"]}
                coalesced = True
            except (ValueError, KeyError, TypeError):
                coalesced = False
        if not coalesced:
            result = runtime.invoke_agent_runtime(
                agentRuntimeArn=os.environ["REASONER_ARN"],
                runtimeSessionId=str(uuid.uuid4()),
                contentType="application/json",
                payload=json.dumps(payload, default=float).encode(),
            )
            body = json.loads(result["response"].read())
            assessment = IncidentAssessment.model_validate(body["assessment"]).check_evidence(
                events
            )
        if state["context"]["all_clear"]:
            assessment.actions = []
        item = {
            "status": "assessed",
            "assessment": assessment.model_dump(mode="json"),
            "model_id": body["model_id"],
            "evidence_ids": [e["event_id"] for e in events],
            "evidence_snapshot": events,
            "state_fingerprint": state["fingerprint"],
            "coalesced": coalesced,
            "context_summary": state["context"],
            "verification": {
                "schema_valid": True,
                "citations_valid": True,
                "complete_snapshot": not state["context"]["sampled"],
                "complete_policy_state": True,
            },
        }
    except Exception as exc:
        item = {
            "status": "assessment_failed",
            "error_type": type(exc).__name__,
            "failure_code": failure_code,
            "message": "Assessment unavailable or evidence changed; automatic retry is bounded. Retry assessment if this persists. No actions authorized.",
            "verification": {
                "schema_valid": False,
                "citations_valid": False,
                "complete_snapshot": False,
            },
        }
    item.update(
        pk=partition(owner, incident),
        sk="ASSESSMENT#" + identifier,
        assessment_id=identifier,
        evidence_revision=revision,
        note_revision=note_revision,
        created_at=int(time.time()),
        expires_at=int(time.time()) + 300,
    )
    if state:
        item["canonical_severity"] = state["severity"]
    try:
        table.put_item(Item=native(item), ConditionExpression="attribute_not_exists(pk)")
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        item = get(owner, incident, "ASSESSMENT#" + identifier)
    return publish(event, owner, incident, identifier, item, summary_key)


def publish(event, owner, incident, identifier, item, summary_key):
    audit(owner, incident, item["status"], identifier, item)
    revision = item.get("evidence_revision", -1)
    try:
        table.update_item(
            Key=summary_key,
            UpdateExpression="SET #s = :status, latest_assessment = :id, assessed_revision = :revision, decision_review = :review REMOVE reviewed_at",
            ConditionExpression="attribute_not_exists(resolved_at) AND attribute_not_exists(deletion_started_at) AND event_count = :revision AND (note_revision = :notes OR (attribute_not_exists(note_revision) AND :notes = :zero)) AND (attribute_not_exists(assessed_revision) OR assessed_revision < :revision OR latest_assessment = :previous)",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":status": item["status"],
                ":id": identifier,
                ":revision": revision,
                ":review": "unreviewed",
                ":previous": event.get("replaces_assessment", ""),
                ":notes": item.get("note_revision", 0),
                ":zero": 0,
            },
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
    summary = table.get_item(Key=summary_key, ConsistentRead=True).get("Item", {})
    ok = actionable(summary, item)
    if summary.get("latest_assessment") == identifier:
        record_briefing(table, owner, incident)
    retry = (
        not summary.get("resolved_at")
        and not summary.get("deletion_started_at")
        and not ok
        and event.get("assessment_attempt", 1) < 3
    )
    return {**event, "assessment_id": identifier, "reasoner_ok": ok, "retry_needed": bool(retry)}
