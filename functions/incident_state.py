"""Lossless paged history, latest device state and bounded model context."""

import hashlib
import json
from collections import Counter
from datetime import datetime
from collections.abc import Iterable, Iterator
from typing import Any

from boto3.dynamodb.conditions import Key
from hazard_priority import red_device_ids, severity as priority_severity


def records(table: Any, owner: str, incident: str) -> Iterator[dict[str, Any]]:
    query: dict[str, Any] = {
        "KeyConditionExpression": Key("pk").eq(f"H#{owner}#I#{incident}")
        & Key("sk").begins_with("EVENT#"),
        "ConsistentRead": True,
        "Limit": 100,
    }
    while True:
        page = table.query(**query)
        yield from page["Items"]
        if not page.get("LastEvaluatedKey"):
            break
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def device_ledger(items: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for item in items:
        if item.get("late_after_resolution"):
            continue
        event = item["event"]
        context = item.get("event_context") or {}
        key = event["source"]["source_id"] + ":" + event["kind"]
        order = (
            datetime.fromisoformat(event["occurred_at"].replace("Z", "+00:00")).timestamp(),
            event["event_id"],
        )
        previous = latest.get(key)
        if previous and previous["order"] >= order:
            continue
        latest[key] = {
            "event": event,
            "context": context,
            "order": order,
            "alarm": context.get("state", {}).get("alarm", "unknown"),
        }
    return latest


def device_summary(row: dict[str, Any], severity: str, red: set[str]) -> dict[str, Any]:
    context, event = row["context"], row["event"]
    identifier = event["source"]["source_id"]
    return {
        "device_id": identifier,
        "name": context.get("device", {}).get("name", identifier),
        "kind": event["kind"],
        "alarm": row["alarm"],
        "connectivity": context.get("state", {}).get("connectivity", "unknown"),
        "event_id": event["event_id"],
        "occurred_at": event["occurred_at"],
        "room": context.get("device", {}).get("room", ""),
        "location_id": context.get("location", {}).get("id"),
        "location_name": context.get("location", {}).get("name"),
        "provenance": context.get("provenance", "legacy_unverified"),
        "level": "normal"
        if row["alarm"] == "clear"
        else "red"
        if identifier in red
        else "amber"
        if severity != "informational"
        else "normal",
    }


def snapshot(table: Any, owner: str, incident: str) -> dict[str, Any]:
    total = 0

    def counted() -> Iterator[dict[str, Any]]:
        nonlocal total
        for item in records(table, owner, incident):
            total += 1
            yield item

    ledger = device_ledger(counted())
    active = [row for row in ledger.values() if row["alarm"] != "clear"]
    priority = {
        "smoke": 0,
        "carbon_monoxide": 0,
        "heat": 0,
        "gas_leak": 0,
        "medical_sos": 0,
        "security_alarm": 0,
        "forced_entry": 0,
        "glass_break": 0,
        "water_leak": 1,
        "severe_weather": 1,
        "freeze_risk": 1,
        "power_outage": 1,
        "tamper": 1,
        "lock_tamper": 1,
    }
    ordered = sorted(
        active, key=lambda row: (priority.get(row["event"]["kind"], 4), -row["order"][0])
    )
    # Always represent each present kind before filling the remaining recent slots.
    selected, kinds = [], set()
    for row in ordered:
        if row["event"]["kind"] not in kinds:
            selected.append(row)
            kinds.add(row["event"]["kind"])
    selected += [row for row in ordered if row not in selected][: max(0, 32 - len(selected))]
    if not selected:
        selected = sorted(ledger.values(), key=lambda row: row["order"], reverse=True)[:1]
    counts = dict(Counter(row["event"]["kind"] for row in active))
    severity = priority_severity(active)
    red = red_device_ids(active)
    devices = [device_summary(row, severity, red) for row in active]
    by_device: dict[str, dict[str, Any]] = {}
    for device in devices:
        previous = by_device.get(device["device_id"])
        if not previous or (device["level"] == "red" and previous["level"] != "red"):
            by_device[device["device_id"]] = device
    # Keep cleared reporters discoverable without re-reading history or changing the
    # active-device/policy boundary. A multi-signal device is counted only once.
    reporting: dict[str, dict[str, Any]] = {}
    for row in sorted(
        ledger.values(),
        key=lambda row: (
            row["alarm"] == "clear",
            priority.get(row["event"]["kind"], 4),
            -row["order"][0],
        ),
    ):
        device = device_summary(row, severity, red)
        previous = reporting.get(device["device_id"])
        if previous:
            previous["kinds"].append(device["kind"])
        else:
            reporting[device["device_id"]] = {**device, "kinds": [device["kind"]]}
    digest = hashlib.sha256(
        json.dumps(
            sorted(
                (key, row["alarm"], row["event"]["observation"], row["context"].get("state", {}))
                for key, row in ledger.items()
            ),
            sort_keys=True,
        ).encode()
    ).hexdigest()
    return {
        "events": [row["event"] for row in selected],
        "policy_events": [row["event"] for row in active],
        "active_devices": list(by_device.values()),
        "reporting_devices": list(reporting.values()),
        "last_reported_at": max(ledger.values(), key=lambda row: row["order"])["event"][
            "occurred_at"
        ]
        if ledger
        else None,
        "unknown_device_count": len(
            {
                row["event"]["source"]["source_id"]
                for row in ledger.values()
                if row["alarm"] == "unknown"
            }
        ),
        "severity": severity,
        "fingerprint": digest,
        "context": {
            "total_events": total,
            "active_signal_count": len(active),
            "active_kind_counts": counts,
            "all_clear": not active,
            "selected_count": len(selected),
            "history_preserved": True,
            "sampled": len(active) > len(selected),
        },
    }


def assessed_severity(
    state: dict[str, Any], assessment: dict[str, Any] | None
) -> tuple[str, list[dict[str, Any]]]:
    """Only current, validated assessment may raise the deterministic severity floor."""
    if not assessment or not state["active_devices"]:
        return state["severity"], state["active_devices"]
    levels = {"informational": 0, "warning": 1, "urgent": 2}
    proposed = assessment.get("severity", "informational")
    severity = max((state["severity"], proposed), key=lambda value: levels.get(value, 0))
    cited = set(assessment.get("evidence_ids", []))
    devices = [
        {
            **device,
            "level": "red"
            if proposed == "urgent" and device["event_id"] in cited
            else device["level"],
        }
        for device in state["active_devices"]
    ]
    return severity, devices
