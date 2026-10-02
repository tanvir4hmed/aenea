"""Mocked persistence regressions. No AWS calls; execution remains deferred."""

import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions"))


class HouseholdRetryTests(unittest.TestCase):
    def setUp(self):
        self.storage = SimpleNamespace(
            audit=Mock(),
            audit_item=Mock(return_value={}),
            attrs=lambda value: value,
            execute=Mock(),
            get=Mock(return_value=None),
            profile=Mock(),
            table=Mock(),
        )
        self.storage.table.name = "offline-table"
        self.storage.table.get_item.return_value = {"Item": {"incident_id": "a"}}
        spec = importlib.util.spec_from_file_location(
            "isolated_household_tools", ROOT / "functions/household_tools.py"
        )
        self.module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"coordination": self.storage}):
            spec.loader.exec_module(self.module)
        self.client = Mock()
        self.sdk = patch.object(self.module.boto3, "client", return_value=self.client)
        self.sdk.start()
        self.addCleanup(self.sdk.stop)
        self.args = {
            "incident_id": "11111111-1111-4111-8111-111111111111",
            "request_id": "22222222-2222-4222-8222-222222222222",
            "person": "Resident A",
            "status": "safe",
        }

    def report(self):
        return self.module.dispatch(
            "owner", {"aenea/read", "aenea/write"}, "report_person_status", self.args
        )

    def test_new_person_reporting_is_retired_without_writes(self):
        with self.assertRaisesRegex(ValueError, "retired"):
            self.report()
        self.client.transact_write_items.assert_not_called()

    def test_retry_returns_original_without_overwriting_newer_state(self):
        original = {"person": "Resident A", "status": "safe", "reported_at": "original"}
        self.storage.get.return_value = {"data": original}
        with self.assertRaisesRegex(ValueError, "retired"):
            self.report()
        self.client.transact_write_items.assert_not_called()

    def test_old_reports_remain_readable(self):
        old = {"person": "Resident A", "status": "unknown", "incident_id": self.args["incident_id"]}
        self.storage.table.query.return_value = {"Items": [old]}
        self.storage.profile.return_value = {"devices": {}}
        result = self.module.dispatch(
            "owner",
            {"aenea/read"},
            "get_household_status",
            {"incident_id": self.args["incident_id"]},
        )
        self.assertEqual(result["items"], [old])
        self.client.transact_write_items.assert_not_called()

    def test_conflicting_request_id_is_rejected(self):
        self.storage.get.return_value = {"data": {"person": "Resident A", "status": "unknown"}}
        with self.assertRaises(ValueError):
            self.report()
        self.client.transact_write_items.assert_not_called()

    def test_read_scope_cannot_write(self):
        with self.assertRaises(PermissionError):
            self.module.dispatch("owner", {"aenea/read"}, "report_person_status", self.args)
        self.client.transact_write_items.assert_not_called()

    def test_acknowledgment_replay_does_not_write(self):
        self.storage.get.return_value = {"data": {"actor": "owner"}}
        result = self.module.dispatch(
            "owner",
            {"aenea/read", "aenea/write"},
            "acknowledge_incident",
            {"incident_id": self.args["incident_id"]},
        )
        self.assertFalse(result["resolved"])
        self.client.transact_write_items.assert_not_called()

    def test_evidence_device_name_wins_without_reading_present_catalog(self):
        device = {
            "device_id": "source",
            "name": "Original kitchen detector",
            "room": "Kitchen",
            "kind": "smoke",
        }
        result = self.module.named_devices("owner", [device])[0]
        self.assertEqual(result["display_name"], "Original kitchen detector")
        self.assertEqual(result["display_name_source"], "evidence")
        self.storage.table.get_item.assert_not_called()

    def test_legacy_catalog_fallback_never_reassigns_historical_context(self):
        device = {
            "device_id": "source",
            "name": "source",
            "room": "",
            "location_id": None,
            "kind": "smoke",
            "alarm": "unknown",
            "provenance": "legacy_unverified",
        }
        with patch.object(
            self.module,
            "read_catalog",
            return_value={
                "devices": [
                    {
                        "id": "source",
                        "name": "Renamed detector",
                        "room": "New room",
                        "location_id": "other",
                    }
                ]
            },
        ) as catalog:
            result = self.module.named_devices("owner", [device])[0]
        catalog.assert_called_once_with(self.storage.table, "owner")
        self.assertEqual(result["display_name"], "Renamed detector")
        self.assertEqual(result["display_name_source"], "current_catalog")
        self.assertEqual(result["name"], "source")
        self.assertEqual(result["room"], "")
        self.assertIsNone(result["location_id"])
        self.assertEqual(result["alarm"], "unknown")
        self.assertEqual(result["provenance"], "legacy_unverified")
        self.assertNotIn("display_name", device)

    def test_missing_legacy_device_uses_human_signal_label(self):
        device = {"device_id": "source", "name": "source", "kind": "carbon_monoxide"}
        with patch.object(self.module, "read_catalog", return_value={"devices": []}):
            result = self.module.named_devices("owner", [device])[0]
        self.assertEqual(result["display_name"], "Carbon monoxide sensor")
        self.assertEqual(result["display_name_source"], "fallback")

    def test_status_retains_tool_contract_and_includes_cleared_named_reporters(self):
        active = {
            "device_id": "active",
            "name": "Hall detector",
            "kind": "smoke",
            "alarm": "active",
        }
        cleared = {
            "device_id": "clear",
            "name": "Kitchen detector",
            "kind": "smoke",
            "alarm": "clear",
        }
        state = {
            "active_devices": [active],
            "reporting_devices": [active, cleared],
            "severity": "warning",
            "context": {"all_clear": False},
            "unknown_device_count": 0,
            "last_reported_at": "2026-10-01T12:00:00Z",
        }
        with patch.object(self.module, "snapshot", return_value=state):
            result = self.module.dispatch(
                "owner",
                {"aenea/read"},
                "get_incident_status",
                {"incident_id": self.args["incident_id"]},
            )
        self.assertEqual(result["active_device_count"], 1)
        self.assertEqual(result["reporting_device_count"], 2)
        self.assertEqual(result["active_devices"][0]["display_name"], "Hall detector")
        self.assertEqual(result["reporting_devices"][1]["alarm"], "clear")
        self.assertEqual(result["reporting_devices"][1]["display_name_source"], "evidence")
        self.assertFalse(result["all_clear"])
        self.assertFalse(result["assessment_current"])
        self.client.transact_write_items.assert_not_called()
