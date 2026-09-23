"""Invoke AgentCore with bounded evidence; persist validated assessment, never fake success."""
import hashlib
import json
import os
import time
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from assessment import IncidentAssessment
from coordination import audit, evidence, get, native, partition, table
from revisions import actionable

runtime = boto3.client("bedrock-agentcore", config=Config(connect_timeout=5, read_timeout=150, retries={"total_max_attempts": 1}))


def handler(event, context):
    owner, incident = event["household_id"], event["incident_id"]
    identifier = hashlib.sha256(str(event["event_id"]).encode()).hexdigest()[:32]
    saved = get(owner, incident, "ASSESSMENT#" + identifier)
    from safety import DEVICES
    summary_key = {"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"}
    revision = table.get_item(Key=summary_key, ConsistentRead=True)["Item"]["event_count"]
    if saved:
        return publish(event, owner, incident, identifier, saved, summary_key)
    failure_code = "snapshot_unavailable"
    try:
        events = evidence(owner, incident)
        after_read = table.get_item(Key=summary_key, ConsistentRead=True)["Item"]["event_count"]
        if revision != after_read or len(events) != revision:
            failure_code = "snapshot_changed"
            raise ValueError("Evidence changed during snapshot")
        if len(events) > 20:
            failure_code = "evidence_budget_exceeded"
            raise ValueError("Evidence exceeds assessment input budget")
        failure_code = "reasoner_unavailable_or_invalid"
        result = runtime.invoke_agent_runtime(agentRuntimeArn=os.environ["REASONER_ARN"],
            runtimeSessionId=str(uuid.uuid4()), contentType="application/json",
            payload=json.dumps({"events": events, "virtual_devices": DEVICES}, default=float).encode())
        body = json.loads(result["response"].read())
        assessment = IncidentAssessment.model_validate(body["assessment"]).check_evidence(events)
        item = {"status": "assessed", "assessment": assessment.model_dump(mode="json"),
                "model_id": body["model_id"], "evidence_ids": [e["event_id"] for e in events],
                "evidence_snapshot": events,
                "verification": {"schema_valid": True, "citations_valid": True, "complete_snapshot": True}}
    except Exception as exc:
        # Fail closed; do not store SDK messages or unvalidated model content.
        item = {"status": "assessment_failed", "error_type": type(exc).__name__,
                "failure_code": failure_code,
                "message": "Assessment input exceeds 20 signals; no evidence was silently omitted and no actions authorized." if failure_code == "evidence_budget_exceeded" else "Reasoner unavailable or evidence changed; no actions authorized.",
                "verification": {"schema_valid": False, "citations_valid": False, "complete_snapshot": False}}
    item.update(pk=partition(owner, incident), sk="ASSESSMENT#" + identifier,
                assessment_id=identifier, evidence_revision=revision,
                created_at=int(time.time()), expires_at=int(time.time()) + 300)
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
        table.update_item(Key=summary_key,
            UpdateExpression="SET #s = :status, latest_assessment = :id, assessed_revision = :revision, decision_review = :review REMOVE reviewed_at",
            ConditionExpression="event_count = :revision AND (attribute_not_exists(assessed_revision) OR assessed_revision < :revision)",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": item["status"], ":id": identifier, ":revision": revision, ":review": "unreviewed"})
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
    summary = table.get_item(Key=summary_key, ConsistentRead=True)["Item"]
    return {**event, "assessment_id": identifier, "reasoner_ok": actionable(summary, item)}
