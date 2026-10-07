"""Signal tier boundaries: ordinary activity must not become a red alert."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "functions"))
from hazard_priority import red_device_ids, severity, tier


def row(device, kind, room="Kitchen", location="home"):
    return {
        "event": {"kind": kind, "source": {"source_id": device}},
        "context": {"device": {"room": room}, "location": {"id": location}},
    }


class SignalPriorityTests(unittest.TestCase):
    def test_multi_room_exercise_has_independent_high_medium_and_untouched_devices(self):
        from incident_state import device_summary, assessed_severity

        choices = [
            ("door", "forced_entry", "Entrance", "warning"),
            ("lock", "lock_tamper", "Entrance", "urgent"),
            ("panel", "security_alarm", "Entrance", "urgent"),
            ("camera", "motion", "Entrance", "warning"),
            ("glass", "glass_break", "Living Room", "warning"),
            ("smoke", "smoke", "Living Room", "warning"),
            ("co", "carbon_monoxide", "Living Room", "urgent"),
            ("heat", "heat", "Kitchen", "urgent"),
            ("gas", "gas_leak", "Kitchen", "urgent"),
            ("dining", "smoke", "Dining Room", "warning"),
            ("master", "smoke", "Master Bedroom", "urgent"),
            ("medical", "medical_sos", "Master Bedroom", "warning"),
            ("family", "smoke", "Family Bedroom", "warning"),
            ("washroom", "water_leak", "Master Washroom", "warning"),
            ("garage", "heat", "Garage", "warning"),
            ("power", "power_outage", "Garage", "urgent"),
        ]
        reports = []
        for identifier, kind, room_name, priority in choices:
            report = row(identifier, kind, room_name)
            report["event"]["source"]["simulated"] = True
            report["event"].update(event_id=identifier, occurred_at="2026-10-07T00:00:00Z")
            report["context"].update(
                provenance="authenticated_simulator", state={"simulated_severity": priority}
            )
            report["alarm"] = "active"
            reports.append(report)
        red = red_device_ids(reports)
        self.assertEqual(red, {"lock", "panel", "co", "heat", "gas", "master", "power"})
        devices = [device_summary(report, severity(reports), red) for report in reports]
        _, assessed = assessed_severity(
            {"severity": "urgent", "active_devices": devices},
            {"severity": "urgent", "evidence_ids": [choice[0] for choice in choices]},
        )
        self.assertEqual(
            next(device for device in assessed if device["device_id"] == "washroom")["level"],
            "amber",
        )
        self.assertNotIn("untouched-window", {device["device_id"] for device in assessed})

    def test_simulated_medium_stays_amber_beside_high_and_real_input_cannot_override(self):
        from incident_state import device_summary

        medium = row("smoke", "smoke")
        high = row("co", "carbon_monoxide")
        for report, value in ((medium, "warning"), (high, "urgent")):
            report["event"]["source"]["simulated"] = True
            report["event"].update(event_id="test", occurred_at="2026-10-07T00:00:00Z")
            report["context"].update(
                provenance="authenticated_simulator", state={"simulated_severity": value}
            )
            report["alarm"] = "active"
        reports = [medium, high]
        self.assertEqual(severity(reports), "urgent")
        self.assertEqual(red_device_ids(reports), {"co"})
        self.assertEqual(device_summary(medium, "urgent", {"co"})["level"], "amber")
        high["event"]["source"]["simulated"] = False
        high["context"]["state"]["simulated_severity"] = "informational"
        self.assertEqual(red_device_ids([high]), {"co"})

    def test_normal_ring_activity_is_notification_only(self):
        rows = [row("doorbell", "doorbell"), row("camera", "motion")]
        self.assertEqual(tier("doorbell"), "informational")
        self.assertEqual(severity(rows), "informational")
        self.assertEqual(red_device_ids(rows), set())

    def test_smoke_needs_distinct_room_corroboration_but_co_is_immediate(self):
        one = [row("smoke-one", "smoke")]
        self.assertEqual(severity(one), "warning")
        self.assertEqual(red_device_ids(one), set())
        pair = one + [row("heat-two", "heat")]
        self.assertEqual(severity(pair), "urgent")
        self.assertEqual(red_device_ids(pair), {"smoke-one", "heat-two"})
        self.assertEqual(severity([row("co", "carbon_monoxide")]), "urgent")
