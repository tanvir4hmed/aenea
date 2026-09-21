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

runtime = boto3.client("bedrock-agentcore", config=Config(connect_timeout=5, read_timeout=150, retries={"total_max_attempts": 1}))


def handler(event, context):
    owner, incident = event["household_id"], event["incident_id"]
    identifier = hashlib.sha256(str(event["event_id"]).encode()).hexdigest()[:32]
    saved = get(owner, incident, "ASSESSMENT#" + identifier)
    if saved:
        audit(owner, incident, saved["status"], identifier, saved)
        return {**event, "assessment_id": identifier, "reasoner_ok": saved["status"] == "assessed"}
    from safety import DEVICES
    summary_key = {"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"}
    revision = table.get_item(Key=summary_key, ConsistentRead=True)["Item"]["event_count"]
    try:
        events = evidence(owner, incident)[:20]
        result = runtime.invoke_agent_runtime(agentRuntimeArn=os.environ["REASONER_ARN"],
            runtimeSessionId=str(uuid.uuid4()), contentType="application/json",
            payload=json.dumps({"events": events, "virtual_devices": DEVICES}, default=float).encode())
        body = json.loads(result["response"].read())
        assessment = IncidentAssessment.model_validate(body["assessment"]).check_evidence(events)
        item = {"status": "assessed", "assessment": assessment.model_dump(mode="json"),
                "model_id": body["model_id"], "evidence_ids": [e["event_id"] for e in events]}
    except Exception as exc:
        # Fail closed; do not store SDK messages or unvalidated model content.
        item = {"status": "assessment_failed", "error_type": type(exc).__name__,
                "message": "Reasoner unavailable or invalid output; no actions authorized"}
    item.update(pk=partition(owner, incident), sk="ASSESSMENT#" + identifier,
                assessment_id=identifier, created_at=int(time.time()), expires_at=int(time.time()) + 300)
    try:
        table.put_item(Item=native(item), ConditionExpression="attribute_not_exists(pk)")
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        item = get(owner, incident, "ASSESSMENT#" + identifier)
    audit(owner, incident, item["status"], identifier, item)
    try:
        table.update_item(Key=summary_key,
            UpdateExpression="SET #s = :status, latest_assessment = :id",
            ConditionExpression="event_count = :revision",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": item["status"], ":id": identifier, ":revision": revision})
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
    return {**event, "assessment_id": identifier, "reasoner_ok": item["status"] == "assessed"}
