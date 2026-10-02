"""Persist decisions using trusted household configuration and current evidence."""

import time
import json
import boto3
from botocore.exceptions import ClientError

from assessment import IncidentAssessment
from coordination import action_id, attrs, audit, evidence, get, native, partition, profile, table
from safety import decision
from revisions import actionable
from lifecycle import deleted
from action_context import location_evidence
from runtime_capabilities import device_actions_enabled


def handler(event, context):
    if not device_actions_enabled():
        return {**event, "action_ids": []}
    owner, incident = event["household_id"], event["incident_id"]
    if deleted(table, owner, incident):
        return {**event, "action_ids": []}
    saved = get(owner, incident, "ASSESSMENT#" + event["assessment_id"])
    summary = table.get_item(
        Key={"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"}, ConsistentRead=True
    )["Item"]
    if not actionable(summary, saved):
        return {**event, "action_ids": []}
    assessment = IncidentAssessment.model_validate_json(
        json.dumps(saved["assessment"], default=float)
    )
    current, events = profile(owner), evidence(owner, incident)
    identifiers = []
    proposals = []
    for proposed in assessment.actions:
        proposed = proposed.model_dump(mode="json")
        candidates = [
            (identity, device)
            for identity, device in current.get("devices", {}).items()
            if device.get("location_id") == summary.get("location_id")
            and summary.get("location_id")
            and device.get("capability") == proposed["device_id"]
        ]
        for identity, device in candidates:
            proposals.append(
                {
                    **proposed,
                    "device_id": identity,
                    "capability": proposed["device_id"],
                    "location_id": summary["location_id"],
                    "device_name": device["name"],
                }
            )
        if not candidates:
            audit(
                owner,
                incident,
                "policy",
                event["assessment_id"] + ":missing:" + proposed["device_id"],
                {
                    "status": "blocked",
                    "policy_reason": "No registered output for this incident location",
                    "proposal": proposed,
                },
            )
    for proposal in proposals:
        policy_events = (
            location_evidence(table, owner, summary["location_id"])[0]
            if proposal["action"] == "close_valve"
            else events
        )
        identifier = action_id(incident, proposal)
        state, reason = decision(
            proposal, policy_events, current, int(time.time()), int(saved["expires_at"])
        )
        item = {
            "pk": partition(owner, incident),
            "sk": "ACTION#" + identifier,
            "action_id": identifier,
            "proposal": proposal,
            "status": state,
            "policy_reason": reason,
            "policy_version": "1.0",
            "profile_revision": current["revision"],
            "assessment_id": event["assessment_id"],
            "expires_at": saved["expires_at"],
            "evidence_revision": saved["evidence_revision"],
            "note_revision": saved.get("note_revision", 0),
            "simulated": True,
        }
        try:
            table.put_item(Item=native(item), ConditionExpression="attribute_not_exists(pk)")
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise
            # A new assessment may reconsider blocked/expired proposals, never completed actions.
            previous = get(owner, incident, "ACTION#" + identifier)
            replaceable = previous["status"] in {
                "blocked",
                "expired",
                "allowed",
                "pending_confirmation",
            } and (previous.get("evidence_revision", -1) <= saved["evidence_revision"])
            if replaceable and previous["assessment_id"] != event["assessment_id"]:
                try:
                    boto3.client("dynamodb").transact_write_items(
                        TransactItems=[
                            {
                                "ConditionCheck": {
                                    "TableName": table.name,
                                    "Key": attrs(
                                        {"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}
                                    ),
                                    "ConditionExpression": "latest_assessment = :id AND event_count = :revision AND attribute_not_exists(resolved_at) AND attribute_not_exists(deletion_started_at)",
                                    "ExpressionAttributeValues": attrs(
                                        {
                                            ":id": event["assessment_id"],
                                            ":revision": saved["evidence_revision"],
                                        }
                                    ),
                                }
                            },
                            {
                                "Put": {
                                    "TableName": table.name,
                                    "Item": attrs(item),
                                    "ConditionExpression": "assessment_id = :old AND #s = :status",
                                    "ExpressionAttributeNames": {"#s": "status"},
                                    "ExpressionAttributeValues": attrs(
                                        {
                                            ":old": previous["assessment_id"],
                                            ":status": previous["status"],
                                        }
                                    ),
                                }
                            },
                        ]
                    )
                except ClientError as race:
                    if race.response["Error"]["Code"] != "TransactionCanceledException":
                        raise
                    continue  # Superseded policy work cannot replace the newer proposal.
            else:
                item = previous
        audit(owner, incident, "policy", identifier + ":" + event["assessment_id"], item)
        identifiers.append(identifier)
    return {**event, "action_ids": identifiers}
