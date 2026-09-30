"""Pure simulator scheduling contract; these are test profiles, not vendor claims."""

from typing import Any
from decimal import Decimal

DEFAULT_PROFILE = {
    "mode": "on_change",
    "interval_seconds": 60,
    "duration_seconds": 300,
    "alarm": "active",
    "connectivity": "online",
    "clear_at_end": False,
}
DEFAULT_LIMIT = 2000
MAX_LIMIT = 10000


def validate_profile(value: Any) -> dict[str, Any]:
    if value is None:
        return dict(DEFAULT_PROFILE)
    if not isinstance(value, dict) or set(value) != set(DEFAULT_PROFILE):
        raise ValueError("Expected complete simulation profile")
    if (
        value["mode"] not in {"on_change", "repeat"}
        or value["alarm"] not in {"active", "clear", "unknown"}
        or value["connectivity"] not in {"online", "offline", "unknown"}
    ):
        raise ValueError("Unsupported simulation state or reporting mode")
    for field, minimum, maximum in [("interval_seconds", 60, 900), ("duration_seconds", 60, 3600)]:
        if (
            type(value[field]) not in {int, Decimal}
            or value[field] != int(value[field])
            or not minimum <= value[field] <= maximum
        ):
            raise ValueError(f"{field} must be {minimum}–{maximum}")
    if type(value["clear_at_end"]) is not bool:
        raise ValueError("clear_at_end must be boolean")
    if value["mode"] == "repeat" and value["alarm"] != "active":
        raise ValueError("Only an active alarm can repeat")
    return {
        **value,
        "interval_seconds": int(value["interval_seconds"]),
        "duration_seconds": int(value["duration_seconds"]),
    }


def expected_count(profile: dict[str, Any]) -> int:
    repeat = (
        (profile["duration_seconds"] - 1) // profile["interval_seconds"] + 1
        if profile["mode"] == "repeat"
        else 1
    )
    return repeat + int(profile["clear_at_end"] and profile["alarm"] != "clear")


def scheduled_state(profile: dict[str, Any], index: int) -> tuple[int, dict[str, str]]:
    total = expected_count(profile)
    if not 0 <= index < total:
        raise ValueError("Schedule exhausted")
    final = profile["clear_at_end"] and profile["alarm"] != "clear" and index == total - 1
    offset = profile["duration_seconds"] if final else index * profile["interval_seconds"]
    return offset, {
        "alarm": "clear" if final else profile["alarm"],
        "connectivity": profile["connectivity"],
    }
