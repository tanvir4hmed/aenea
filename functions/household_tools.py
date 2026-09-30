"""Shared domain operations behind the MCP server; no model-supplied household IDs."""

import base64
import json
import re
import uuid
import boto3
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from coordination import audit, audit_item, attrs, execute, get, profile, table
from cursors import decode_cursor
from revisions import current_assessment
from lifecycle import require_active
from event_contract import timeline_context

WRITE_TOOLS = {
    "report_person_status",
    "acknowledge_incident",
    "request_safe_action",
    "confirm_action",
}
TOOLS = WRITE_TOOLS | {
    "get_incident_status",
    "get_incident_timeline",
    "get_household_status",
    "get_action_status",
    "get_responder_summary",
}


def key_condition(partition, prefix):
    """DynamoDB forbids an empty begins_with key value."""
    condition = Key("pk").eq(partition)
    return condition & Key("sk").begins_with(prefix) if prefix else condition


def page(partition, prefix="", cursor=None):
    query = {
        "KeyConditionExpression": key_condition(partition, prefix),
        "Limit": 50,
        "ConsistentRead": True,
    }
    if cursor:
        query["ExclusiveStartKey"] = decode_cursor(cursor, partition, prefix)
    result = table.query(**query)
    return {
        "items": [timeline_context(item) for item in result["Items"]],
        "next_cursor": base64.urlsafe_b64encode(
            json.dumps(result["LastEvaluatedKey"]).encode()
        ).decode()
        if result.get("LastEvaluatedKey")
        else None,
    }


def dispatch(owner, scopes, name, args):
    if name not in TOOLS or "aenea/read" not in scopes:
        raise PermissionError("Read permission required")
    if name in WRITE_TOOLS and "aenea/write" not in scopes:
        raise PermissionError("Write permission required")
    if name == "report_person_status":
        raise ValueError(
            "Person reporting is retired. Existing reports remain readable in history; use an optional incident note for context."
        )
    allowed = {
        "get_incident_status": {"incident_id"},
        "get_incident_timeline": {"incident_id", "cursor"},
        "get_household_status": {"incident_id", "cursor"},
        "report_person_status": {"incident_id", "person", "status", "request_id"},
        "acknowledge_incident": {"incident_id"},
        "request_safe_action": {"incident_id", "action_id"},
        "confirm_action": {"incident_id", "action_id", "assessment_id", "confirm"},
        "get_action_status": {"incident_id", "action_id"},
        "get_responder_summary": {"incident_id"},
    }
    if not isinstance(args, dict) or set(args) - allowed[name]:
        raise ValueError("Unsupported arguments")
    incident = str(uuid.UUID(args["incident_id"]))
    require_active(table, owner, incident)
    summary = table.get_item(
        Key={"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"}, ConsistentRead=True
    ).get("Item")
    if not summary:
        raise ValueError("Incident not found in this household")
    if name == "get_household_status":
        result = page(f"H#{owner}#I#{incident}", "PERSON#", args.get("cursor"))
        return {
            **result,
            "devices": profile(owner).get("devices", {}),
            "incident_id": incident,
            "notice": "Incident-scoped self-reports, not current location or verified safety. Absence means unknown.",
        }
    if name == "get_incident_status":
        assessment = (
            get(owner, incident, "ASSESSMENT#" + summary["latest_assessment"])
            if summary.get("latest_assessment")
            else None
        )
        return {
            "incident": summary,
            "assessment": assessment,
            "simulated": True,
            "assessment_current": current_assessment(summary, assessment),
        }
    if name == "get_incident_timeline":
        return page(f"H#{owner}#I#{incident}", cursor=args.get("cursor"))
    if name == "acknowledge_incident":
        # Acknowledgment is not incident resolution or a claim that everyone is safe.
        if not get(owner, incident, "AUDIT#acknowledged#" + owner):
            try:
                boto3.client("dynamodb").transact_write_items(
                    TransactItems=[
                        {
                            "Update": {
                                "TableName": table.name,
                                "Key": attrs({"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"}),
                                "UpdateExpression": "SET acknowledged_by = :owner",
                                "ConditionExpression": "attribute_exists(pk)",
                                "ExpressionAttributeValues": attrs({":owner": owner}),
                            }
                        },
                        {
                            "Put": {
                                "TableName": table.name,
                                "Item": attrs(
                                    audit_item(
                                        owner, incident, "acknowledged", owner, {"actor": owner}
                                    )
                                ),
                                "ConditionExpression": "attribute_not_exists(pk)",
                            }
                        },
                    ]
                )
            except ClientError as exc:
                if exc.response["Error"]["Code"] != "TransactionCanceledException" or not get(
                    owner, incident, "AUDIT#acknowledged#" + owner
                ):
                    raise
        return {"acknowledged": True, "incident_id": incident, "resolved": False}
    if name == "get_responder_summary":
        records = page(f"H#{owner}#I#{incident}")
        people = page(f"H#{owner}#I#{incident}", "PERSON#")
        signals = page(f"H#{owner}#I#{incident}", "EVENT#")
        actions = page(f"H#{owner}#I#{incident}", "ACTION#")
        latest = (
            get(owner, incident, "ASSESSMENT#" + summary["latest_assessment"])
            if summary.get("latest_assessment")
            else None
        )
        return {
            "incident": summary,
            "records": records["items"],
            "assessment_current": current_assessment(summary, latest),
            "assessment": latest,
            "signals": signals["items"],
            "actions": actions["items"],
            "people": [p for p in people["items"] if p["incident_id"] == incident],
            "partial": any(p["next_cursor"] for p in (records, people, signals, actions)),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "consistency": "Multi-read snapshot; incident updates can arrive during preparation. Refresh before sharing.",
            "notice": "Synthetic coordination handoff only. Not sent to emergency services.",
        }
    identifier = args["action_id"]
    if not isinstance(identifier, str) or not re.fullmatch(r"[a-f0-9]{32}", identifier):
        raise ValueError("Invalid action ID")
    action = get(owner, incident, "ACTION#" + identifier)
    if not action:
        raise ValueError("Action not found")
    if name == "get_action_status":
        if action["status"] not in {"succeeded", "failed", "blocked", "expired"} and (
            action.get("evidence_revision") != summary.get("event_count")
            or action.get("note_revision", 0) != summary.get("note_revision", 0)
            or summary.get("resolved_at")
            or action["assessment_id"] != summary.get("latest_assessment")
            or summary.get("decision_review") == "rejected"
        ):
            return {
                **action,
                "status": "superseded",
                "result": "New evidence or rejected review prevents execution",
                "execution_performed": False,
            }
        return action
    if name == "confirm_action":
        if (
            args.get("confirm") is not True
            or not isinstance(args.get("assessment_id"), str)
            or not re.fullmatch(r"[a-f0-9]{32}", args["assessment_id"])
        ):
            raise ValueError("Explicit confirmation is required")
        if action["status"] != "pending_confirmation":
            return action
        audit(
            owner,
            incident,
            "confirmation",
            identifier + ":" + args["assessment_id"],
            {"actor": owner, "assessment_id": args["assessment_id"]},
        )
        result = execute(
            owner, incident, identifier, confirmed=True, expected_assessment=args["assessment_id"]
        )
        from briefings import record

        record(table, owner, incident)
        return result
    # Only an existing assessed/policy-checked action can be requested.
    result = execute(owner, incident, identifier)
    from briefings import record

    record(table, owner, incident)
    return result
