"""Authenticated workspace management and incident lifecycle endpoints.

The Lambda resource name is retained to preserve existing API integrations.
"""

import base64
import json
import uuid
import os
import boto3

from common import household, response
from coordination import table
from catalog import read_catalog, save_catalog
from decision_review import review
from lifecycle import require_active, request_deletion
from incident_names import rename_incident
from simulation_library import read_library, save_library
from incident_engine import resolve
from simulation_runs import start as start_run, command as run_command, view as run_view, get_run
from simulation_budget import extend as extend_budget
from incident_notes import save_note
from briefings import record as record_briefing
from conversation import message as conversation_message
from boto3.dynamodb.conditions import Key
from cursors import decode_cursor


def handler(event, context):
    if "routeKey" not in event:
        record_briefing(table, event["household_id"], event["incident_id"])
        return event
    try:
        owner = household(event)
        route = event["routeKey"]
        if route == "GET /household/runs/{run_id}":
            run = get_run(table, owner, str(uuid.UUID(event["pathParameters"]["run_id"])))
            return (
                response(200, run_view(run)) if run else response(404, {"error": "Run not found"})
            )
        if route == "GET /household/runs":
            query = {
                "KeyConditionExpression": Key("pk").eq(f"H#{owner}")
                & Key("sk").begins_with("RUN#"),
                "Limit": 20,
                "ConsistentRead": True,
            }
            cursor = (event.get("queryStringParameters") or {}).get("cursor")
            if cursor:
                query["ExclusiveStartKey"] = decode_cursor(cursor, f"H#{owner}", "RUN#")
            result = table.query(**query)
            return response(
                200,
                {
                    "items": [run_view(row) for row in result["Items"]],
                    "next_cursor": base64.urlsafe_b64encode(
                        json.dumps(result["LastEvaluatedKey"]).encode()
                    ).decode()
                    if result.get("LastEvaluatedKey")
                    else None,
                },
            )
        if route == "GET /household/simulations":
            return response(200, read_library(table, owner))
        if route == "GET /household/catalog":
            return response(200, read_catalog(table, owner))
        raw = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw, validate=True).decode()
        if len(raw.encode()) > (
            2500000
            if route == "PUT /household/simulations"
            else 120000
            if route == "PUT /household/catalog"
            else 16000
        ):
            raise ValueError("Oversized request")
        body = json.loads(raw)
        if route == "POST /household/runs":
            return start_run(table, owner, body)
        if route == "POST /household/runs/{run_id}":
            return run_command(table, owner, event["pathParameters"]["run_id"], body)
        if route == "PUT /household/simulations":
            return save_library(table, owner, body)
        if route == "PUT /household/catalog":
            return save_catalog(table, owner, body)
        params = event["pathParameters"]
        incident = str(uuid.UUID(params["incident_id"]))
        if route == "POST /incidents/{incident_id}/delete":
            return request_deletion(table, owner, incident, body)
        require_active(table, owner, incident)
        if route == "POST /incidents/{incident_id}/message":
            scopes = set(
                event.get("requestContext", {})
                .get("authorizer", {})
                .get("jwt", {})
                .get("claims", {})
                .get("scope", "")
                .split()
            )
            from oauth_scopes import permission_scopes

            return conversation_message(owner, incident, body, permission_scopes(scopes))
        if route == "POST /incidents/{incident_id}/notes":
            return save_note(table, owner, incident, body)
        if route == "POST /incidents/{incident_id}/simulation-limit":
            return extend_budget(table, owner, incident, body)
        if route == "POST /incidents/{incident_id}/resolve":
            result = resolve(table, owner, incident, body)
            if result["statusCode"] == 200:
                record_briefing(table, owner, incident)
            return result
        if route == "POST /incidents/{incident_id}/reassess":
            summary = table.get_item(
                Key={"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}, ConsistentRead=True
            ).get("Item", {})
            if not summary or summary.get("resolved_at"):
                return response(409, {"error": "Only an open incident can be reassessed"})
            result = boto3.client("events").put_events(
                Entries=[
                    {
                        "EventBusName": os.environ["EVENT_BUS"],
                        "Source": "aenea.ingress",
                        "DetailType": "IncidentEvent",
                        "Detail": json.dumps(
                            {
                                "assessment_only": True,
                                "household_id": owner,
                                "incident_id": incident,
                                "event_id": str(uuid.uuid4()),
                            }
                        ),
                    }
                ]
            )
            return response(
                503 if result.get("FailedEntryCount") else 202,
                {"status": "retry" if result.get("FailedEntryCount") else "assessment_requested"},
            )
        if route == "PUT /incidents/{incident_id}/name":
            return rename_incident(table, owner, incident, body)
        if route == "POST /incidents/{incident_id}/assessments/{assessment_id}/review":
            return review(owner, incident, params["assessment_id"], body)
        return response(404, {"error": "Route not found"})
    except PermissionError:
        return response(401, {"error": "Authentication required"})
    except ValueError as exc:
        if event.get("routeKey") in {
            "PUT /household/catalog",
            "PUT /household/simulations",
            "POST /household/runs",
            "POST /household/runs/{run_id}",
            "POST /incidents/{incident_id}/simulation-limit",
        }:
            return response(400, {"error": str(exc) or "Invalid catalog settings"})
        return response(400, {"error": "Invalid workspace request"})
    except (TypeError, KeyError, AttributeError):
        return response(400, {"error": "Invalid workspace request"})
