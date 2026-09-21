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
        self.storage = SimpleNamespace(audit=Mock(), audit_item=Mock(return_value={}),
            attrs=lambda value: value, execute=Mock(), get=Mock(return_value=None),
            profile=Mock(), table=Mock())
        self.storage.table.name = "offline-table"
        self.storage.table.get_item.return_value = {"Item": {"incident_id": "a"}}
        spec = importlib.util.spec_from_file_location("isolated_household_tools", ROOT / "functions/household_tools.py")
        self.module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"coordination": self.storage}):
            spec.loader.exec_module(self.module)
        self.client = Mock()
        self.sdk = patch.object(self.module.boto3, "client", return_value=self.client)
        self.sdk.start()
        self.addCleanup(self.sdk.stop)
        self.args = {"incident_id": "11111111-1111-4111-8111-111111111111",
                     "request_id": "22222222-2222-4222-8222-222222222222",
                     "person": "Resident A", "status": "safe"}

    def report(self):
        return self.module.dispatch("owner", {"aenea/read", "aenea/write"}, "report_person_status", self.args)

    def test_first_report_commits_person_and_audit_together(self):
        result = self.report()
        self.assertEqual(result["status"], "safe")
        operations = self.client.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(len(operations), 2)
        self.assertEqual(operations[1]["Put"]["ConditionExpression"], "attribute_not_exists(pk)")

    def test_retry_returns_original_without_overwriting_newer_state(self):
        original = {"person": "Resident A", "status": "safe", "reported_at": "original"}
        self.storage.get.return_value = {"data": original}
        self.assertEqual(self.report(), original)
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
        result = self.module.dispatch("owner", {"aenea/read", "aenea/write"},
            "acknowledge_incident", {"incident_id": self.args["incident_id"]})
        self.assertFalse(result["resolved"])
        self.client.transact_write_items.assert_not_called()
