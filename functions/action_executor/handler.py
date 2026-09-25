"""Execute virtual actions only; authenticated settings and confirmation endpoints."""
import base64
import json
import re
import uuid

from common import household, response
from coordination import audit, execute, get, profile, table
from safety import DEVICES
from catalog import read_catalog, save_catalog
from decision_review import review
from lifecycle import require_active, request_deletion
from incident_names import rename_incident
from simulation_library import read_library, save_library


def handler(event, context):
    if "routeKey" not in event:
        results = [execute(event["household_id"], event["incident_id"], key) for key in event["action_ids"]]
        return {**event, "results": [{"action_id": r["action_id"], "status": r["status"]} for r in results]}
    try:
        owner = household(event)
        route = event["routeKey"]
        if route == "GET /household/simulations":
            return response(200, read_library(table, owner))
        if route == "GET /household/catalog":
            return response(200, read_catalog(table, owner))
        if route == "GET /household/devices":
            return response(200, profile(owner))
        raw = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw, validate=True).decode()
        if len(raw.encode()) > (120000 if route in {"PUT /household/catalog", "PUT /household/simulations"} else 8000):
            raise ValueError("Oversized request")
        body = json.loads(raw)
        if route == "PUT /household/simulations":
            return save_library(table, owner, body)
        if route == "PUT /household/catalog":
            return save_catalog(table, owner, body)
        if route == "PUT /household/devices":
            if set(body) != {"devices"} or not isinstance(body["devices"], dict):
                raise ValueError("Expected devices")
            devices = body["devices"]
            if set(devices) - set(DEVICES):
                raise ValueError("Unknown device")
            for device in devices.values():
                if set(device) != {"enabled", "preauthorized", "fail_next"} or any(type(v) is not bool for v in device.values()):
                    raise ValueError("Expected boolean device settings")
                device["simulated"] = True
            item = {"pk": f"H#{owner}", "sk": "PROFILE", "devices": devices, "revision": str(uuid.uuid4())}
            table.put_item(Item=item)
            return response(200, item)
        params = event["pathParameters"]
        incident = str(uuid.UUID(params["incident_id"]))
        if route == "POST /incidents/{incident_id}/delete":
            return request_deletion(table, owner, incident, body)
        require_active(table, owner, incident)
        if route == "PUT /incidents/{incident_id}/name":
            return rename_incident(table, owner, incident, body)
        if route == "POST /incidents/{incident_id}/assessments/{assessment_id}/review":
            return review(owner, incident, params["assessment_id"], body)
        identifier = params["action_id"]
        if (not re.fullmatch(r"[a-f0-9]{32}", identifier) or not isinstance(body, dict)
                or set(body) != {"confirm", "assessment_id"} or body["confirm"] is not True
                or not isinstance(body["assessment_id"], str) or not re.fullmatch(r"[a-f0-9]{32}", body["assessment_id"])):
            raise ValueError("Explicit confirmation required")
        item = get(owner, incident, "ACTION#" + identifier)
        if not item:
            return response(404, {"error": "Action not found"})
        if item["status"] != "pending_confirmation":
            return response(409, {"error": "Action is not awaiting confirmation", "status": item["status"]})
        audit(owner, incident, "confirmation", identifier + ":" + body["assessment_id"], {"actor": owner, "action_id": identifier, "assessment_id": body["assessment_id"]})
        return response(200, execute(owner, incident, identifier, confirmed=True, expected_assessment=body["assessment_id"]))
    except PermissionError:
        return response(401, {"error": "Authentication required"})
    except ValueError as exc:
        if event.get("routeKey") in {"PUT /household/catalog", "PUT /household/simulations"}:
            return response(400, {"error": str(exc) or "Invalid catalog settings"})
        return response(400, {"error": "Invalid action request"})
    except (TypeError, KeyError, AttributeError):
        return response(400, {"error": "Invalid action request"})
