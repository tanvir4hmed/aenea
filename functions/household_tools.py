"""Shared domain operations behind the MCP server; no model-supplied household IDs."""
import base64
import json
import re
import uuid
import boto3
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key
from coordination import audit, audit_item, attrs, execute, get, profile, table

WRITE_TOOLS = {"report_person_status", "acknowledge_incident", "request_safe_action", "confirm_action"}
TOOLS = WRITE_TOOLS | {"get_incident_status", "get_incident_timeline", "get_household_status",
                       "get_action_status", "get_responder_summary"}


def page(partition, prefix="", cursor=None):
    query = {"KeyConditionExpression": Key("pk").eq(partition) & Key("sk").begins_with(prefix),
             "Limit": 50, "ConsistentRead": True}
    if cursor:
        key = json.loads(base64.urlsafe_b64decode(cursor))
        if (set(key) != {"pk", "sk"} or key["pk"] != partition
                or not isinstance(key["sk"], str) or not key["sk"].startswith(prefix)):
            raise ValueError("Invalid cursor")
        query["ExclusiveStartKey"] = key
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
        "get_household_status": {"incident_id", "cursor"}, "report_person_status": {"incident_id", "person", "status"},
        "acknowledge_incident": {"incident_id"}, "request_safe_action": {"incident_id", "action_id"},
        "confirm_action": {"incident_id", "action_id", "confirm"},
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
        return {"incident": summary, "assessment": assessment, "simulated": True}
    if name == "get_incident_timeline":
        return page(f"H#{owner}#I#{incident}", cursor=args.get("cursor"))
    if name == "report_person_status":
        person, status = args["person"], args["status"]
        if not isinstance(person, str) or not person.strip() or not re.fullmatch(r"[A-Za-z0-9 _-]{1,60}", person):
            raise ValueError("Use a short synthetic household name")
        person = person.strip()
        if status not in {"safe", "needs_help", "not_home", "unknown"}:
            raise ValueError("Unknown check-in status")
        item = {"pk": f"H#{owner}#I#{incident}", "sk": "PERSON#" + person.casefold(), "person": person,
                "status": status, "incident_id": incident, "reported_by": owner,
                "reported_at": datetime.now(timezone.utc).isoformat(), "self_reported": True,
                "simulated": True}
        # A saved check-in and its evidence must commit together.
        entry = audit_item(owner, incident, "person_status", str(uuid.uuid4()), item)
        boto3.client("dynamodb").transact_write_items(TransactItems=[
            {"Put": {"TableName": table.name, "Item": attrs(item)}},
            {"Put": {"TableName": table.name, "Item": attrs(entry),
                     "ConditionExpression": "attribute_not_exists(pk)"}},
        ])
        return item
    if name == "acknowledge_incident":
        # Acknowledgment is not incident resolution or a claim that everyone is safe.
        table.update_item(Key={"pk": f"H#{owner}", "sk": f"INCIDENT#{incident}"},
            UpdateExpression="SET acknowledged_by = :owner",
            ConditionExpression="attribute_exists(pk)", ExpressionAttributeValues={":owner": owner})
        audit(owner, incident, "acknowledged", owner, {"actor": owner})
        return {"acknowledged": True, "incident_id": incident, "resolved": False}
    if name == "get_responder_summary":
        records = page(f"H#{owner}#I#{incident}")
        people = page(f"H#{owner}#I#{incident}", "PERSON#")
        signals = page(f"H#{owner}#I#{incident}", "EVENT#")
        actions = page(f"H#{owner}#I#{incident}", "ACTION#")
        latest = get(owner, incident, "ASSESSMENT#" + summary["latest_assessment"]) if summary.get("latest_assessment") else None
        return {"incident": summary, "records": records["items"],
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
        return action
    if name == "confirm_action":
        if args.get("confirm") is not True:
            raise ValueError("Explicit confirmation is required")
        if action["status"] != "pending_confirmation":
            return action
        audit(owner, incident, "confirmation", identifier + ":" + action["assessment_id"], {"actor": owner})
        return execute(owner, incident, identifier, confirmed=True)
    # Only an existing assessed/policy-checked action can be requested.
    return execute(owner, incident, identifier)
