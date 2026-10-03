"""Model interprets bounded read/acknowledgment intents, never device approvals."""

import json
import os
import re
import uuid
import boto3
from botocore.config import Config
from assessment import ConversationIntent
from common import response


def interpret(text):
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 600:
        raise ValueError("Use a command of 1–600 characters")
    result = boto3.client(
        "bedrock-agentcore",
        config=Config(connect_timeout=2, read_timeout=10, retries={"total_max_attempts": 1}),
    ).invoke_agent_runtime(
        agentRuntimeArn=os.environ["REASONER_ARN"],
        runtimeSessionId=str(uuid.uuid4()),
        contentType="application/json",
        payload=json.dumps({"task": "command", "text": text}).encode(),
    )
    return ConversationIntent.model_validate(json.loads(result["response"].read())["intent"])


def readable(value, limit=160):
    """Keep display prose short and remove machine identifiers from legacy summaries."""
    text = re.sub(
        r"\b(?:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|[a-f0-9]{32,64})\b",
        "device",
        str(value or ""),
        flags=re.IGNORECASE,
    )
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


def device_report(device):
    kind = "/".join(device.get("kinds") or [device.get("kind", "signal")]).replace("_", " ")
    name = device.get("display_name") or device.get("name")
    if not name or name == device.get("device_id"):
        name = "Sensor"
    label = readable(name, 80)
    # Only the original evidence snapshot may place a historical report in a room.
    if device.get("room"):
        label += " in " + readable(device["room"], 40)
    return f"{label} ({kind}" + (", clear)" if device.get("alarm") == "clear" else ")")


def assessment_status(data):
    incident, assessment = data.get("incident", {}), data.get("assessment") or {}
    if incident.get("resolved_at"):
        return "This incident was resolved by human confirmation; that does not certify safety."
    if not assessment:
        return "An assessment is not available yet."
    if not data.get("assessment_current"):
        return "The assessment is out of date; newer sensor reports or notes need review."
    if assessment.get("status") != "assessed":
        return "The latest evidence does not have a completed assessment yet."
    if incident.get("decision_review") == "rejected":
        return "The latest assessment was rejected and needs review."
    return "The assessment matches the latest received sensor reports and notes."


def answer(topic, data):
    """Answer the classified question using bounded, authenticated read results only."""
    incident = data.get("incident", {})
    assessment = data.get("assessment") or {}
    devices = data.get("reporting_devices", data.get("active_devices", []))
    active = data.get("active_devices", [])
    if topic == "occupancy":
        result = "I cannot confirm whether anyone is home. "
        result += (
            "Motion reports do not verify occupancy."
            if any("motion" in device.get("kinds", [device.get("kind")]) for device in devices)
            else "The available sensor reports do not verify occupancy."
        )
        if incident.get("note_revision", 0):
            result += " Saved notes are unverified reports."
        return result
    if topic == "assessment":
        return assessment_status(data)
    if topic == "devices":
        if not devices:
            return "No reporting devices are available in this incident's received evidence."
        shown = devices[:3]
        count = data.get("reporting_device_count", data.get("active_device_count", len(devices)))
        result = "Reported: " + "; ".join(device_report(device) for device in shown)
        if count > len(shown):
            result += f"; and {count - len(shown)} more devices"
        result += "."
        if data.get("unknown_device_count") or any(
            device.get("alarm", "unknown") == "unknown" for device in shown
        ):
            result += " Some alarm states are unknown."
        return result
    if topic == "uncertainty":
        if (
            not data.get("assessment_current")
            or assessment.get("status") != "assessed"
            or incident.get("decision_review") == "rejected"
        ):
            return assessment_status(data) + " Cause and occupancy are not confirmed by sensors."
        uncertainties = assessment.get("assessment", {}).get("uncertainties", [])
        if uncertainties:
            return (
                "Still unverified: " + readable("; ".join(uncertainties[:2]), 220).rstrip(".") + "."
            )
        return "No additional uncertainty was recorded. Sensor reports still do not confirm occupancy or safety."
    if topic == "changes":
        if incident.get("resolved_at"):
            return assessment_status(data)
        if not assessment:
            return "Sensor reports have been received; the first assessment is not available yet."
        if assessment.get("evidence_revision") is None:
            return "Changes cannot be compared with this older assessment. " + assessment_status(
                data
            )
        reports = max(0, incident.get("event_count", 0) - assessment["evidence_revision"])
        notes = max(0, incident.get("note_revision", 0) - assessment.get("note_revision", 0))
        changes = []
        if reports:
            changes.append(f"{reports} new sensor report{'s' if reports != 1 else ''}")
        if notes:
            changes.append(f"{notes} new note{'s' if notes != 1 else ''}")
        if changes:
            return (
                "Since the last assessment: "
                + " and ".join(changes)
                + ". An updated assessment is needed."
            )
        return "No newer sensor reports or notes since the last assessment. " + assessment_status(
            data
        )
    if incident.get("resolved_at"):
        return assessment_status(data)
    if data.get("all_clear") and data.get("reporting_device_count", len(devices)):
        result = "The latest received sensor states are clear; this does not confirm safety."
    elif active:
        kinds = list(
            dict.fromkeys(str(device.get("kind", "signal")).replace("_", " ") for device in active)
        )
        result = (
            "Reported signals: "
            + ", ".join(kinds[:3])
            + (" and others" if len(kinds) > 3 else "")
            + "."
        )
        result += " Current severity: " + str(data.get("severity", "unknown")) + "."
    else:
        result = "No active signals are available in the received incident data."
    if (
        not data.get("assessment_current")
        or assessment.get("status") != "assessed"
        or incident.get("decision_review") == "rejected"
    ):
        result += " " + assessment_status(data)
    return result


def message(owner, incident, body, scopes):
    from household_tools import dispatch

    if not {"aenea/read", "aenea/write"} <= set(scopes):
        raise PermissionError("Read and write scopes required for conversation commands")
    if "read_only" in body and type(body["read_only"]) is not bool:
        raise ValueError("read_only must be a boolean")
    try:
        interpreted = interpret(body.get("text"))
    except ValueError:
        raise
    except Exception:
        return response(
            503,
            {
                "error": "Command interpreter unavailable. Use status buttons or save a note. No action taken."
            },
        )
    allowed = {
        "status": "get_incident_status",
        "timeline": "get_incident_timeline",
        "acknowledge": "acknowledge_incident",
    }
    if body.get("read_only") and interpreted.intent == "acknowledge":
        return response(
            200,
            {
                "tool": None,
                "answer": "Use the I have seen this button to acknowledge the incident. Voice questions do not record acknowledgments.",
                "topic": "general",
            },
        )
    if interpreted.intent not in allowed:
        return response(
            200,
            {
                "tool": None,
                "message": "Try asking what happened, which devices reported, whether the assessment is current, or ask to see the evidence timeline. Device actions must be reviewed and confirmed on their action card.",
            },
        )
    tool = allowed[interpreted.intent]
    data = dispatch(owner, scopes, tool, {"incident_id": incident})
    reply = (
        answer(interpreted.topic, data)
        if interpreted.intent == "status"
        else "Your acknowledgment is recorded; this does not resolve the incident."
        if interpreted.intent == "acknowledge"
        else "Open the evidence timeline to review recorded sensor reports and actions."
    )
    return response(
        200,
        {
            "tool": tool,
            "data": data,
            "answer": reply,
            "topic": interpreted.topic,
        },
    )
