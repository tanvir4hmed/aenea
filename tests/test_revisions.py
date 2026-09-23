"""Offline revision, stale execution and publication regressions."""
import importlib.util
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions"))
sys.path.insert(0, str(ROOT / "shared"))
from revisions import actionable, current_assessment


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RevisionTests(unittest.TestCase):
    def test_current_requires_published_identity_and_exact_evidence_revision(self):
        summary = {"event_count": 2, "latest_assessment": "new"}
        assessment = {"assessment_id": "new", "evidence_revision": 2, "status": "assessed"}
        self.assertTrue(actionable(summary, assessment))
        self.assertFalse(actionable({**summary, "event_count": 3}, assessment))
        self.assertFalse(actionable(summary, {**assessment, "assessment_id": "old"}))
        self.assertFalse(actionable({**summary, "decision_review": "rejected"}, assessment))
        self.assertFalse(current_assessment(summary, {"assessment_id": "new"}))

    def setUp(self):
        self.table = Mock()
        with patch.dict(os.environ, {"STATE_TABLE": "offline"}), patch("boto3.resource") as resource:
            resource.return_value.Table.return_value = self.table
            self.module = load("isolated_coordination", "functions/coordination.py")
        self.action = {"status": "allowed", "assessment_id": "assessment-a", "evidence_revision": 2,
                       "proposal": {"device_id": "virtual_lights", "action": "lights_on"}, "expires_at": 9999999999}
        self.assessment = {"status": "assessed", "assessment_id": "assessment-a", "evidence_revision": 2}
        self.summary = {"event_count": 2, "latest_assessment": "assessment-a"}
        self.module.get = Mock(side_effect=[self.action, self.assessment])
        self.module.profile = Mock(return_value={"revision": "profile-v1", "devices": {}})
        self.module.evidence = Mock(return_value=[])
        self.module.decision = Mock(return_value=("allowed", "passed"))

    def test_new_signal_blocks_old_action_before_device_write(self):
        self.table.get_item.return_value = {"Item": {**self.summary, "event_count": 3}}
        result = self.module.execute("owner", "incident", "action")
        self.assertEqual(result["status"], "superseded")
        self.assertFalse(result["execution_performed"])
        self.module.evidence.assert_not_called()

    def test_rejected_review_blocks_execution(self):
        self.table.get_item.return_value = {"Item": {**self.summary, "decision_review": "rejected"}}
        self.assertEqual(self.module.execute("owner", "incident", "action")["status"], "superseded")

    def test_transaction_guards_against_signal_or_rejection_arriving_after_read(self):
        self.table.get_item.return_value = {"Item": self.summary}
        client = Mock()
        with patch.dict(os.environ, {"STATE_TABLE": "offline"}), patch("boto3.client", return_value=client):
            result = self.module.execute("owner", "incident", "action")
        self.assertEqual(result["status"], "succeeded")
        check = client.transact_write_items.call_args.kwargs["TransactItems"][0]["ConditionCheck"]
        self.assertIn("latest_assessment = :assessment", check["ConditionExpression"])
        self.assertIn("decision_review <> :rejected", check["ConditionExpression"])
        self.assertIn("event_count = :revision", check["ConditionExpression"])


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.storage = SimpleNamespace(audit=Mock(), evidence=Mock(), get=Mock(), native=lambda value: value,
                                       partition=lambda owner, incident: "partition", table=Mock())
        with patch.dict(sys.modules, {"coordination": self.storage}), patch("boto3.client"):
            self.module = load("isolated_reasoner", "functions/invoke_reasoner/handler.py")

    def test_out_of_order_result_is_saved_but_not_actionable(self):
        self.storage.table.update_item.side_effect = ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "UpdateItem")
        self.storage.table.get_item.return_value = {"Item": {"event_count": 3, "latest_assessment": "new"}}
        result = self.module.publish({}, "owner", "incident", "old", {"assessment_id": "old", "evidence_revision": 2, "status": "assessed"}, {})
        self.assertFalse(result["reasoner_ok"])
        self.assertIn("assessed_revision < :revision", self.storage.table.update_item.call_args.kwargs["ConditionExpression"])

    def test_over_budget_never_invokes_model_with_truncated_evidence(self):
        self.storage.get.return_value = None
        self.storage.evidence.return_value = [{}] * 21
        self.storage.table.get_item.return_value = {"Item": {"event_count": 21}}
        self.module.handler({"household_id": "owner", "incident_id": "incident", "event_id": "e21"}, None)
        self.module.runtime.invoke_agent_runtime.assert_not_called()
        item = self.storage.table.put_item.call_args.kwargs["Item"]
        self.assertEqual(item["failure_code"], "evidence_budget_exceeded")
        self.assertEqual(item["status"], "assessment_failed")

    def test_changed_snapshot_is_not_sent_to_model(self):
        self.storage.get.return_value = None
        self.storage.evidence.return_value = [{}, {}]
        self.storage.table.get_item.side_effect = [{"Item": {"event_count": 1}}, {"Item": {"event_count": 2}}, {"Item": {"event_count": 2}}]
        self.module.handler({"household_id": "owner", "incident_id": "incident", "event_id": "e1"}, None)
        self.module.runtime.invoke_agent_runtime.assert_not_called()
        self.assertEqual(self.storage.table.put_item.call_args.kwargs["Item"]["failure_code"], "snapshot_changed")
