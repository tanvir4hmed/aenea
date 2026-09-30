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


def severity(rows: list[dict]) -> str:
    """Return the deterministic severity floor from current active device states."""
    if any(row["event"]["kind"] in IMMEDIATE_URGENT for row in rows):
        return "urgent"
    if _corroborated_fire_gas(rows):
        return "urgent"
    if any(row["event"]["kind"] in CRITICAL | WARNING for row in rows):
        return "warning"
    return "informational"


def red_device_ids(rows: list[dict]) -> set[str]:
    """Only a critical report, or distinct fire/gas corroboration, turns a map marker red."""
    red = {
        row["event"]["source"]["source_id"]
        for row in rows
        if row["event"]["kind"] in IMMEDIATE_URGENT
    }
    for sources in _corroborated_fire_gas(rows).values():
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
