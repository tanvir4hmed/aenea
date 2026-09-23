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


class DecisionReviewTests(unittest.TestCase):
    def setUp(self):
        self.storage = SimpleNamespace(attrs=lambda value: value, get=Mock(), table=Mock(),
            audit_item=lambda owner, incident, kind, identity, payload: {"pk": owner, "sk": identity, "recorded_at": "now", "data": payload})
        spec = importlib.util.spec_from_file_location("isolated_review", ROOT / "functions/decision_review.py")
        self.module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"coordination": self.storage}):
            spec.loader.exec_module(self.module)
        self.body = {"request_id": "22222222-2222-4222-8222-222222222222", "verdict": "rejected", "note": "Needs review"}
        self.identifier = "a" * 32
        self.client = Mock()
        self.storage.get.side_effect = [None, {"status": "assessed", "evidence_revision": 2}]

    def invoke(self):
        with patch.dict(os.environ, {"STATE_TABLE": "offline"}), patch.object(self.module.boto3, "client", return_value=self.client):
            return self.module.review("owner", "incident", self.identifier, self.body)

    def test_review_and_gate_are_written_atomically(self):
        self.assertEqual(self.invoke()["statusCode"], 200)
        ops = self.client.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(len(ops), 2)
        self.assertIn("event_count = :revision", ops[0]["Update"]["ConditionExpression"])
        self.assertEqual(ops[0]["Update"]["Key"]["pk"], "H#owner")

    def test_same_request_replay_does_not_rewrite_gate(self):
        self.storage.get.side_effect = None
        self.storage.get.return_value = {"data": {"assessment_id": self.identifier, "verdict": "rejected", "note": "Needs review", "reviewed_by": "owner"}}
        self.assertEqual(self.invoke()["statusCode"], 200)
        self.client.transact_write_items.assert_not_called()

    def test_new_evidence_during_review_returns_conflict(self):
        self.client.transact_write_items.side_effect = ClientError({"Error": {"Code": "TransactionCanceledException"}}, "TransactWriteItems")
        self.storage.get.side_effect = [None, {"status": "assessed", "evidence_revision": 2}, None]
        self.assertEqual(self.invoke()["statusCode"], 409)
