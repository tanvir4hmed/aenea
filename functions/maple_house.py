"""Shared fixed demonstration house. Reading defaults never overwrites a saved catalog."""

import json
from pathlib import Path

LAYOUT = json.loads(Path(__file__).with_name("house_layout.json").read_text(encoding="utf-8"))
HOUSE = LAYOUT["location"]
ROOMS = frozenset(room for floor in LAYOUT["floors"] for room in floor["rooms"])


def furnished_catalog():
    return {
        "revision": None,
        "locations": [dict(HOUSE)],
        "devices": [
            {
                "id": f"c7413b88-57f4-4c23-b6ea-{index:012d}",
                "location_id": HOUSE["id"],
                "name": f"{room} · {label}",
                "room": room,
                "type": kind,
                "connection": "simulation",
                "enabled": True,
            }
            for index, (room, kind, label) in enumerate(LAYOUT["devices"], start=1)
        ],
    }
