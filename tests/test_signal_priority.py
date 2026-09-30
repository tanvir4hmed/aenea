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
