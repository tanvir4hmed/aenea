"""Aenea ingestion envelope; embedded IncidentBridge 1.0 events stay unchanged."""

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from incidentbridge import IncidentEvent

from catalog import DEVICE_KINDS, read_catalog

CATEGORIES = {"camera": "camera", "weather_feed": "weather"}


def event_state(payload: dict[str, Any]) -> dict[str, str]:
    version = payload.get("contract_version", "1.0")
    if version not in {"1.0", "1.1"}:
        raise ValueError("Unsupported ingestion contract version")
    if version == "1.0":
        if "state" in payload:
            raise ValueError("State requires contract_version 1.1")
        return {"alarm": "unknown", "connectivity": "unknown"}
    state = payload.get("state")
    if not isinstance(state, dict) or set(state) != {"alarm", "connectivity"}:
        raise ValueError("State requires alarm and connectivity")
    if state["alarm"] not in {"active", "clear", "unknown"} or state["connectivity"] not in {
        "online",
        "offline",
        "unknown",
    }:
        raise ValueError("Unsupported device state")
    return dict(state)


def receipt_digest(event_digest: str, payload: dict[str, Any], state: dict[str, str]) -> str:
    if payload.get("contract_version", "1.0") == "1.0":
        return event_digest
    value = json.dumps({"event": event_digest, "version": "1.1", "state": state}, sort_keys=True)
    return hashlib.sha256(value.encode()).hexdigest()


def enrich_event(
    table: Any, owner: str, event: IncidentEvent, state: dict[str, str]
) -> dict[str, Any]:
    """Observations never establish location; only the owner's catalog can."""
    catalog = read_catalog(table, owner)
    device = next((d for d in catalog["devices"] if d["id"] == event.source.source_id), None)
    if not device or not device["enabled"] or device["connection"] != "simulation":
        raise ValueError("Register an enabled simulation device in Settings before sending alerts")
    if event.kind not in DEVICE_KINDS.get(device["type"], []):
        raise ValueError("Signal is not supported by this device")
    if event.source.category != CATEGORIES.get(device["type"], "sensor"):
        raise ValueError("Source category does not match the registered device")
    location = next(
        (loc for loc in catalog["locations"] if loc["id"] == device["location_id"]), None
    )
    if not location:
        raise ValueError("Device location no longer exists")
    return {
        "contract_version": "1.1",
        "received_at": datetime.now(timezone.utc).isoformat(),
        "state": state,
        "provenance": "authenticated_simulator",
        "catalog_revision": catalog["revision"],
        "device": {key: device[key] for key in ("id", "name", "type", "room", "location_id")},
        "location": {key: location[key] for key in ("id", "name", "address")},
    }


def historical_context(detail: dict[str, Any]) -> dict[str, Any]:
    """Old records stay unverified; never retroactively infer location or alarm state."""
    return detail.get("event_context") or {
        "contract_version": "1.0",
        "provenance": "legacy_unverified",
        "state": {"alarm": "unknown", "connectivity": "unknown"},
    }


def timeline_context(item: dict[str, Any]) -> dict[str, Any]:
    return {**item, "event_context": historical_context(item)} if "event" in item else item
