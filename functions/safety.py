"""Deterministic policy. Observation text and model confidence cannot authorize actions."""
from datetime import datetime, timezone

DEVICES = {"virtual_lights": "lights_on", "virtual_siren": "siren_on",
           "virtual_notification": "notify", "virtual_valve": "close_valve"}
HAZARDS = {"smoke", "carbon_monoxide", "water_leak", "medical_sos", "severe_weather"}


def decision(proposal, events, profile, now, expires_at, confirmed=False):
    if now >= expires_at:
        return "expired", "Proposal expired; request a new assessment"
    device_id, action = proposal["device_id"], proposal["action"]
    if DEVICES.get(device_id) != action:
        return "blocked", "Unsupported device/action pair"
    device = profile.get("devices", {}).get(device_id, {})
    if device.get("enabled") is not True or device.get("simulated") is not True:
        return "blocked", "Virtual device is not enabled for this household"
    fresh = []
    for event in events:
        timestamp = datetime.fromisoformat(event["occurred_at"].replace("Z", "+00:00")).timestamp()
        if event["source"]["simulated"] is True and 0 <= now - timestamp <= 900:
            fresh.append(event)
    citations = set(proposal["evidence_ids"])
    if not citations or not citations <= {e["event_id"] for e in fresh}:
        return "blocked", "Evidence is missing, stale or future dated"
    kinds = {e["kind"] for e in fresh if e["event_id"] in citations}
    all_kinds = {e["kind"] for e in fresh}
    if not kinds & HAZARDS:
        return "blocked", "Context signals alone cannot authorize an action"
    if action == "close_valve":
        if "water_leak" not in kinds or all_kinds & {"smoke", "carbon_monoxide"}:
            return "blocked", "Valve only supports water leak without smoke/CO evidence"
        return ("allowed", "Explicit confirmation accepted") if confirmed else (
            "pending_confirmation", "Closing virtual valve requires explicit confirmation")
    if action == "siren_on" and not kinds & {"smoke", "carbon_monoxide"}:
        return "blocked", "Siren is limited to smoke/CO signals"
    if device.get("preauthorized") is not True:
        return "blocked", "Household has not preauthorized this action"
    return "allowed", "Household preauthorization and evidence checks passed"
