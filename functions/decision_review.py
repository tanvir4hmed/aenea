"""Audited human review, distinct from policy authorization or device confirmation."""
import re
import uuid

import boto3
from botocore.exceptions import ClientError

from common import response, table_name
from coordination import attrs, audit_item, get, table


def review(owner, incident, identifier, body):
    if not re.fullmatch(r"[a-f0-9]{32}", identifier) or not isinstance(body, dict) or set(body) != {"request_id", "verdict", "note"}:
        raise ValueError("Invalid review")
    request_id = str(uuid.UUID(body["request_id"]))
    if body["verdict"] not in {"accepted", "rejected"} or not isinstance(body["note"], str) or len(body["note"]) > 500:
        raise ValueError("Invalid review")
    payload = {"assessment_id": identifier, "verdict": body["verdict"], "note": body["note"], "reviewed_by": owner}
    previous = get(owner, incident, "AUDIT#decision_review#" + request_id)
    if previous:
        return response(200, previous) if previous["data"] == payload else response(409, {"error": "Review request ID already used"})
    assessment = get(owner, incident, "ASSESSMENT#" + identifier)
    if not assessment or assessment.get("status") != "assessed" or "evidence_revision" not in assessment:
        return response(409, {"error": "Only a current, successful assessment can be reviewed"})
    entry = audit_item(owner, incident, "decision_review", request_id, payload)
    try:
        boto3.client("dynamodb").transact_write_items(TransactItems=[
            {"Update": {"TableName": table_name(), "Key": attrs({"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"}),
                "UpdateExpression": "SET decision_review = :verdict, reviewed_at = :time",
                "ConditionExpression": "attribute_not_exists(deletion_started_at) AND latest_assessment = :id AND event_count = :revision",
                "ExpressionAttributeValues": attrs({":verdict": body["verdict"], ":time": entry["recorded_at"],
                    ":id": identifier, ":revision": assessment["evidence_revision"]})}},
            {"Put": {"TableName": table_name(), "Item": attrs(entry), "ConditionExpression": "attribute_not_exists(pk)"}},
        ])
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        saved = get(owner, incident, "AUDIT#decision_review#" + request_id)
        if saved and saved["data"] == payload:
            return response(200, saved)
        return response(409, {"error": "Assessment changed. Refresh before reviewing again."})
    return response(200, entry)
