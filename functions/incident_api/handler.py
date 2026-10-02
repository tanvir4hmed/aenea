"""Read-only incident APIs, always scoped by the authenticated identity."""

import base64
import json
import uuid

import boto3
from boto3.dynamodb.conditions import Key, Attr

from common import household, response, table_name
from cursors import decode_cursor
from revisions import current_assessment
from lifecycle import deleted
from event_contract import timeline_context
from incident_state import snapshot, assessed_severity
from simulation_budget import read_budget
from incident_notes import latest_notes
from evidence_cache import EvidenceCache

table = boto3.resource("dynamodb").Table(table_name())
evidence_cache = EvidenceCache()


def key_condition(partition, prefix):
    """DynamoDB forbids an empty begins_with key value."""
    condition = Key("pk").eq(partition)
    return condition & Key("sk").begins_with(prefix) if prefix else condition


def handler(request, context):
    if request["routeKey"] == "GET /health":
        return response(
            200, {"service": "aenea", "status": "handler-responsive", "dependency_checks": False}
        )
    try:
        owner = household(request)
        params = request.get("queryStringParameters") or {}
        incident_id = (request.get("pathParameters") or {}).get("incident_id")
        view = params.get("view", "all") if incident_id else "all"
        if view not in {"all", "status", "records"} or (view == "status" and params.get("cursor")):
            raise ValueError("Invalid incident view")
        partition = f"H#{owner}"
        prefix = "DELETED#" if request["routeKey"] == "GET /household/deletions" else "INCIDENT#"
        if incident_id:
            incident_id = str(uuid.UUID(incident_id))
            if deleted(table, owner, incident_id):
                return response(410, {"error": "Incident is being deleted or has been deleted"})
            partition += f"#I#{incident_id}"
            prefix = ""  # Evidence, assessments, policy decisions and action results share this partition.
            summary = table.get_item(
                Key={"pk": f"H#{owner}", "sk": f"INCIDENT#{incident_id}"}, ConsistentRead=True
            ).get("Item")
            if not summary:
                return response(404, {"error": "Incident not found"})
            if summary.get("deletion_started_at"):
                return response(410, {"error": "Incident is being deleted or has been deleted"})
        query = {
            "KeyConditionExpression": key_condition(partition, prefix),
            "Limit": 50,
            "ConsistentRead": True,
        }
        if prefix == "INCIDENT#":
            query["FilterExpression"] = Attr("deletion_started_at").not_exists()
        if params.get("cursor"):
            query["ExclusiveStartKey"] = decode_cursor(params["cursor"], partition, prefix)
        # Live polling needs authoritative current state, not repeated audit pages.
        # Evidence pagination needs records only, without rebuilding current state.
        result = {"Items": []} if view == "status" else table.query(**query)
        next_cursor = None
        if result.get("LastEvaluatedKey"):
            next_cursor = base64.urlsafe_b64encode(
                json.dumps(result["LastEvaluatedKey"]).encode()
            ).decode()
        metadata = {}
        if incident_id and view != "records":
            latest = (
                table.get_item(
                    Key={"pk": partition, "sk": "ASSESSMENT#" + summary["latest_assessment"]},
                    ConsistentRead=True,
                ).get("Item")
                if summary.get("latest_assessment")
                else None
            )
            metadata = {
                "incident": summary,
                "latest_assessment": latest,
                "assessment_current": current_assessment(summary, latest),
                "simulation_budget": read_budget(table, owner, incident_id),
            }
            metadata["briefing"] = table.get_item(
                Key={"pk": partition, "sk": "BRIEFING"}, ConsistentRead=True
            ).get("Item")
            metadata["notes"] = (
                latest_notes(table, owner, incident_id)
                if summary.get("note_revision")
                else {"items": [], "total": 0, "partial": False}
            )
            actions, action_query = (
                [],
                {
                    "KeyConditionExpression": Key("pk").eq(partition)
                    & Key("sk").begins_with("ACTION#"),
                    "ConsistentRead": True,
                },
            )
            while True:
                action_page = table.query(**action_query)
                actions.extend(action_page["Items"])
                if not action_page.get("LastEvaluatedKey"):
                    break
                action_query["ExclusiveStartKey"] = action_page["LastEvaluatedKey"]
            metadata["actions"] = actions
            state = evidence_cache.get(owner, incident_id, summary.get("event_count"))
            cache_miss = state is None
            if cache_miss:
                state = snapshot(table, owner, incident_id)
            after = table.get_item(
                Key={"pk": f"H#{owner}", "sk": f"INCIDENT#{incident_id}"}, ConsistentRead=True
            ).get("Item", {})
            if not after or after.get("deletion_started_at"):
                return response(410, {"error": "Incident is being deleted or has been deleted"})
            if (
                after.get("event_count") == summary.get("event_count")
                and after.get("resolved_at") == summary.get("resolved_at")
                and after.get("note_revision", 0) == summary.get("note_revision", 0)
                and after.get("latest_assessment") == summary.get("latest_assessment")
                and after.get("decision_review") == summary.get("decision_review")
            ):
                if cache_miss:
                    evidence_cache.put(owner, incident_id, summary.get("event_count"), state)
                severity, devices = assessed_severity(
                    state,
                    latest.get("assessment")
                    if metadata["assessment_current"]
                    and summary.get("decision_review") != "rejected"
                    else None,
                )
                metadata.update(
                    active_devices=[] if summary.get("resolved_at") else devices,
                    canonical_severity="informational" if summary.get("resolved_at") else severity,
                    last_reported_at=state.get("last_reported_at"),
                )
            else:
                metadata["assessment_current"] = False
                metadata["refreshing"] = True
        return response(
            200,
            {
                "household_id": owner,
                "items": [timeline_context(item) for item in result["Items"]],
                "next_cursor": next_cursor,
                **metadata,
            },
        )
    except PermissionError:
        return response(401, {"error": "Authentication required"})
    except (ValueError, TypeError, KeyError, UnicodeError, AttributeError):
        return response(400, {"error": "Invalid query"})
