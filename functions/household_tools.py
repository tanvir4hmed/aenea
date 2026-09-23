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

WRITE_TOOLS = {"report_person_status", "acknowledge_incident", "request_safe_action", "confirm_action"}
TOOLS = WRITE_TOOLS | {"get_incident_status", "get_incident_timeline", "get_household_status",
                       "get_action_status", "get_responder_summary"}


def page(partition, prefix="", cursor=None):
    query = {"KeyConditionExpression": Key("pk").eq(partition) & Key("sk").begins_with(prefix),
             "Limit": 50, "ConsistentRead": True}
    if cursor:
        query["ExclusiveStartKey"] = decode_cursor(cursor, partition, prefix)
    result = table.query(**query)
    return {"items": result["Items"], "next_cursor": base64.urlsafe_b64encode(
        json.dumps(result["LastEvaluatedKey"]).encode()).decode() if result.get("LastEvaluatedKey") else None}


def dispatch(owner, scopes, name, args):
    if name not in TOOLS or "aenea/read" not in scopes:
        raise PermissionError("Read permission required")
    if name in WRITE_TOOLS and "aenea/write" not in scopes:
        raise PermissionError("Write permission required")
    allowed = {
        "get_incident_status": {"incident_id"}, "get_incident_timeline": {"incident_id", "cursor"},
        "get_household_status": {"incident_id", "cursor"}, "report_person_status": {"incident_id", "person", "status", "request_id"},
        "acknowledge_incident": {"incident_id"}, "request_safe_action": {"incident_id", "action_id"},
        "confirm_action": {"incident_id", "action_id", "assessment_id", "confirm"},
        "get_action_status": {"incident_id", "action_id"}, "get_responder_summary": {"incident_id"},
    }
    if not isinstance(args, dict) or set(args) - allowed[name]:
        raise ValueError("Unsupported arguments")
    incident = str(uuid.UUID(args["incident_id"]))
    summary = table.get_item(Key={"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"},
                             ConsistentRead=True).get("Item")
    if not summary:
        raise ValueError("Incident not found in this household")
    if name == "get_household_status":
        result = page(f"H#{owner}#I#{incident}", "PERSON#", args.get("cursor"))
        return {**result, "devices": profile(owner).get("devices", {}), "incident_id": incident,
                "notice": "Incident-scoped self-reports, not current location or verified safety. Absence means unknown."}
    if name == "get_incident_status":
        assessment = get(owner, incident, "ASSESSMENT#" + summary["latest_assessment"]) if summary.get("latest_assessment") else None
        return {"incident": summary, "assessment": assessment, "simulated": True,
                "assessment_current": current_assessment(summary, assessment)}
    if name == "get_incident_timeline":
        return page(f"H#{owner}#I#{incident}", cursor=args.get("cursor"))
    if name == "report_person_status":
        person, status = args["person"], args["status"]
        if not isinstance(person, str) or not person.strip() or not re.fullmatch(r"[A-Za-z0-9 _-]{1,60}", person):
            raise ValueError("Use a short synthetic household name")
        person = person.strip()
        if status not in {"safe", "needs_help", "not_home", "unknown"}:
            raise ValueError("Unknown check-in status")
        request_id = str(uuid.UUID(args["request_id"]))
        saved = get(owner, incident, "AUDIT#person_status#" + request_id)
        if saved:
            if saved["data"]["person"] != person or saved["data"]["status"] != status:
                raise ValueError("Request ID already used for another check-in")
            return saved["data"]
        item = {"pk": f"H#{owner}#I#{incident}", "sk": "PERSON#" + person.casefold(), "person": person,
                "status": status, "incident_id": incident, "reported_by": owner,
                "reported_at": datetime.now(timezone.utc).isoformat(), "self_reported": True,
                "simulated": True}
        # A saved check-in and its evidence must commit together.
        entry = audit_item(owner, incident, "person_status", request_id, item)
        try:
            boto3.client("dynamodb").transact_write_items(TransactItems=[
                {"Put": {"TableName": table.name, "Item": attrs(item)}},
                {"Put": {"TableName": table.name, "Item": attrs(entry),
                         "ConditionExpression": "attribute_not_exists(pk)"}},
            ])
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "TransactionCanceledException":
                raise
            saved = get(owner, incident, "AUDIT#person_status#" + request_id)
            if not saved or saved["data"]["person"] != person or saved["data"]["status"] != status:
                raise
            return saved["data"]
        return item
    if name == "acknowledge_incident":
        # Acknowledgment is not incident resolution or a claim that everyone is safe.
        if not get(owner, incident, "AUDIT#acknowledged#" + owner):
            try:
                boto3.client("dynamodb").transact_write_items(TransactItems=[
                    {"Update": {"TableName": table.name,
                        "Key": attrs({"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"}),
                        "UpdateExpression": "SET acknowledged_by = :owner",
                        "ConditionExpression": "attribute_exists(pk)",
                        "ExpressionAttributeValues": attrs({":owner": owner})}},
                    {"Put": {"TableName": table.name,
                        "Item": attrs(audit_item(owner, incident, "acknowledged", owner, {"actor": owner})),
                        "ConditionExpression": "attribute_not_exists(pk)"}},
                ])
            except ClientError as exc:
                if (exc.response["Error"]["Code"] != "TransactionCanceledException"
                        or not get(owner, incident, "AUDIT#acknowledged#" + owner)):
                    raise
        return {"acknowledged": True, "incident_id": incident, "resolved": False}
    if name == "get_responder_summary":
        records = page(f"H#{owner}#I#{incident}")
        people = page(f"H#{owner}#I#{incident}", "PERSON#")
        signals = page(f"H#{owner}#I#{incident}", "EVENT#")
        actions = page(f"H#{owner}#I#{incident}", "ACTION#")
        latest = get(owner, incident, "ASSESSMENT#" + summary["latest_assessment"]) if summary.get("latest_assessment") else None
        return {"incident": summary, "records": records["items"],
                "assessment_current": current_assessment(summary, latest),
                "assessment": latest, "signals": signals["items"], "actions": actions["items"],
                "people": [p for p in people["items"] if p["incident_id"] == incident],
                "partial": any(p["next_cursor"] for p in (records, people, signals, actions)),
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "consistency": "Multi-read snapshot; incident updates can arrive during preparation. Refresh before sharing.",
                "notice": "Synthetic coordination handoff only. Not sent to emergency services."}
    identifier = args["action_id"]
    if not isinstance(identifier, str) or not re.fullmatch(r"[a-f0-9]{32}", identifier):
        raise ValueError("Invalid action ID")
    action = get(owner, incident, "ACTION#" + identifier)
    if not action:
        raise ValueError("Action not found")
    if name == "get_action_status":
        if action["status"] not in {"succeeded", "failed", "blocked", "expired"} and (
                action.get("evidence_revision") != summary.get("event_count")
                or action["assessment_id"] != summary.get("latest_assessment")
                or summary.get("decision_review") == "rejected"):
            return {**action, "status": "superseded", "result": "New evidence or rejected review prevents execution", "execution_performed": False}
        return action
    if name == "confirm_action":
        if args.get("confirm") is not True or not isinstance(args.get("assessment_id"), str) or not re.fullmatch(r"[a-f0-9]{32}", args["assessment_id"]):
            raise ValueError("Explicit confirmation is required")
        if action["status"] != "pending_confirmation":
            return action
        audit(owner, incident, "confirmation", identifier + ":" + args["assessment_id"], {"actor": owner, "assessment_id": args["assessment_id"]})
        return execute(owner, incident, identifier, confirmed=True, expected_assessment=args["assessment_id"])
    # Only an existing assessed/policy-checked action can be requested.
    return execute(owner, incident, identifier)
