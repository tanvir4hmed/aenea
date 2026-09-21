"""Pure policy regressions; no AWS or model calls. Deferred suite: python -m unittest discover -s tests."""
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "functions"))
from safety import decision

NOW = 1700000000


def signal(kind="smoke", age=0):
    return {"event_id": kind, "kind": kind, "source": {"simulated": True},
            "occurred_at": datetime.fromtimestamp(NOW - age, timezone.utc).isoformat()}


class PolicyTests(unittest.TestCase):
    def evaluate(self, action="lights_on", device="virtual_lights", kinds=("smoke",),
                 confirmed=False, preauthorized=True, age=0, expires=NOW + 60):
        proposal = {"action": action, "device_id": device, "evidence_ids": [kinds[0]]}
        profile = {"devices": {device: {"enabled": True, "simulated": True,
                                        "preauthorized": preauthorized}}}
        return decision(proposal, [signal(kind, age) for kind in kinds], profile,
                        NOW, expires, confirmed)[0]

    def test_preapproved_lights(self):
        self.assertEqual(self.evaluate(), "allowed")

    def test_no_preapproval(self):
        self.assertEqual(self.evaluate(preauthorized=False), "blocked")

    def test_motion_cannot_authorize(self):
        self.assertEqual(self.evaluate(kinds=("motion",)), "blocked")

    def test_valve_requires_confirmation(self):
        self.assertEqual(self.evaluate("close_valve", "virtual_valve", ("water_leak",)), "pending_confirmation")

    def test_confirmed_water_valve(self):
        self.assertEqual(self.evaluate("close_valve", "virtual_valve", ("water_leak",), True), "allowed")

    def test_smoke_overrides_valve_confirmation(self):
        self.assertEqual(self.evaluate("close_valve", "virtual_valve", ("water_leak", "smoke"), True), "blocked")

    def test_stale_and_future_evidence(self):
        for age in (901, -10):
            self.assertEqual(self.evaluate(age=age), "blocked")

    def test_expired_proposal(self):
        self.assertEqual(self.evaluate(expires=NOW), "expired")

    def test_device_action_mismatch(self):
        self.assertEqual(self.evaluate("close_valve", "virtual_lights"), "blocked")


if __name__ == "__main__":
    unittest.main()
