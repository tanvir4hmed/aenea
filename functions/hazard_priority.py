"""Conservative signal tiers shared by state, briefing and policy boundaries.

Tiers describe an alert response, never a diagnosis or emergency-service outcome.
"""

INFORMATIONAL = {
    "doorbell",
    "motion",
    "package",
    "vehicle",
    "person_detected",
    "contact_open",
}
WARNING = {"water_leak", "severe_weather", "freeze_risk", "power_outage", "tamper", "lock_tamper"}
CRITICAL = {
    "smoke",
    "carbon_monoxide",
    "heat",
    "gas_leak",
    "medical_sos",
    "security_alarm",
    "forced_entry",
    "glass_break",
}
FIRE_GAS = {"smoke", "carbon_monoxide", "heat", "gas_leak"}
IMMEDIATE_URGENT = {
    "carbon_monoxide",
    "gas_leak",
    "medical_sos",
    "security_alarm",
    "forced_entry",
    "glass_break",
}


def tier(kind: str) -> str:
    if kind in CRITICAL:
        return "critical"
    if kind in WARNING:
        return "warning"
    return "informational"


def simulated_severity(row: dict) -> str | None:
    """Exercise input only, not a measurement or a real-device severity override."""
    if (
        row["event"]["source"].get("simulated") is not True
        or row["context"].get("provenance") != "authenticated_simulator"
    ):
        return None
    value = row["context"].get("state", {}).get("simulated_severity")
    return value if value in {"informational", "warning", "urgent"} else None


def severity(rows: list[dict]) -> str:
    """Return the deterministic severity floor from current active device states."""
    ordinary = [row for row in rows if simulated_severity(row) is None]
    if any(simulated_severity(row) == "urgent" for row in rows) or any(
        row["event"]["kind"] in IMMEDIATE_URGENT for row in ordinary
    ):
        return "urgent"
    if _corroborated_fire_gas(ordinary):
        return "urgent"
    if any(simulated_severity(row) == "warning" for row in rows) or any(
        row["event"]["kind"] in CRITICAL | WARNING for row in ordinary
    ):
        return "warning"
    return "informational"


def red_device_ids(rows: list[dict]) -> set[str]:
    """Only a critical report, or distinct fire/gas corroboration, turns a map marker red."""
    red = {
        row["event"]["source"]["source_id"]
        for row in rows
        if simulated_severity(row) == "urgent"
        or (simulated_severity(row) is None and row["event"]["kind"] in IMMEDIATE_URGENT)
    }
    for sources in _corroborated_fire_gas(
        [row for row in rows if simulated_severity(row) is None]
    ).values():
        red.update(sources)
    return red


def _corroborated_fire_gas(rows: list[dict]) -> dict[tuple[str | None, str], set[str]]:
    groups: dict[tuple[str | None, str], set[str]] = {}
    for row in rows:
        event, context = row["event"], row["context"]
        if event["kind"] not in FIRE_GAS:
            continue
        room = context.get("device", {}).get("room", "").strip().casefold()
        if not room:
            continue
        key = (context.get("location", {}).get("id"), room)
        groups.setdefault(key, set()).add(event["source"]["source_id"])
    return {key: sources for key, sources in groups.items() if len(sources) >= 2}
