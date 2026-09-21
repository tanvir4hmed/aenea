"""Persist decisions using trusted household configuration and current evidence."""
import time
import json
from botocore.exceptions import ClientError

from assessment import IncidentAssessment
from coordination import action_id, audit, evidence, get, native, partition, profile, table
from safety import decision


def handler(event, context):
    owner, incident = event["household_id"], event["incident_id"]
    saved = get(owner, incident, "ASSESSMENT#" + event["assessment_id"])
    if saved["status"] != "assessed":
        return {**event, "action_ids": []}
    assessment = IncidentAssessment.model_validate_json(json.dumps(saved["assessment"], default=float))
    current, events = profile(owner), evidence(owner, incident)
    identifiers = []
    for proposal in assessment.actions:
        proposal = proposal.model_dump(mode="json")
        identifier = action_id(incident, proposal)
        state, reason = decision(proposal, events, current, int(time.time()), int(saved["expires_at"]))
        item = {"pk": partition(owner, incident), "sk": "ACTION#" + identifier,
                "action_id": identifier, "proposal": proposal, "status": state,
                "policy_reason": reason, "policy_version": "1.0",
                "profile_revision": current["revision"],
                "assessment_id": event["assessment_id"], "expires_at": saved["expires_at"],
                "simulated": True}
        try:
            table.put_item(Item=native(item), ConditionExpression="attribute_not_exists(pk)")
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise
            # A new assessment may reconsider blocked/expired proposals, never completed actions.
            previous = get(owner, incident, "ACTION#" + identifier)
            replaceable = previous["status"] in {"blocked", "expired"} or (
                previous["status"] in {"allowed", "pending_confirmation"} and previous["expires_at"] <= int(time.time()))
            if replaceable and previous["assessment_id"] != event["assessment_id"]:
                table.put_item(Item=native(item), ConditionExpression="assessment_id = :old AND #s = :status",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={":old": previous["assessment_id"], ":status": previous["status"]})
            else:
                item = previous
        audit(owner, incident, "policy", identifier + ":" + event["assessment_id"], item)
        identifiers.append(identifier)
    return {**event, "action_ids": identifiers}
