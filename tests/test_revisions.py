"""Offline revision, stale execution and publication regressions."""

import importlib.util
import io
import json
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


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.storage = SimpleNamespace(
            audit=Mock(),
            evidence=Mock(),
            get=Mock(),
            native=lambda value: value,
            partition=lambda owner, incident: "partition",
            table=Mock(),
        )
        with patch.dict(sys.modules, {"coordination": self.storage}), patch("boto3.client"):
            self.module = load("isolated_reasoner", "functions/invoke_reasoner/handler.py")
        self.module.deleted = Mock(return_value=None)

    def test_out_of_order_result_is_saved_but_not_actionable(self):
        self.storage.table.update_item.side_effect = ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException"}}, "UpdateItem"
        )
        self.storage.table.get_item.return_value = {
            "Item": {"event_count": 3, "latest_assessment": "new"}
        }
        result = self.module.publish(
            {},
            "owner",
            "incident",
            "old",
            {"assessment_id": "old", "evidence_revision": 2, "status": "assessed"},
            {},
        )
        self.assertFalse(result["reasoner_ok"])
        self.assertIn(
            "assessed_revision < :revision",
            self.storage.table.update_item.call_args.kwargs["ConditionExpression"],
        )

    def test_over_twenty_events_uses_bounded_state_not_lifetime_rejection(self):
        self.storage.get.return_value = None
        signal = {"event_id": "latest", "kind": "smoke", "source": {"source_id": "detector"}}
        self.module.snapshot = Mock(
            return_value={
                "events": [signal],
                "context": {"sampled": False, "all_clear": False, "total_events": 250},
                "fingerprint": "state",
                "active_devices": [],
                "severity": "warning",
            }
        )
        self.storage.table.get_item.return_value = {"Item": {"event_count": 21}}
        assessment = {
            "incident_type": "smoke",
            "severity": "warning",
            "confidence": 0.5,
            "summary": "Reported smoke",
            "evidence_ids": ["latest"],
            "uncertainties": [],
            "actions": [],
        }
        self.module.runtime.invoke_agent_runtime.return_value = {
            "response": io.BytesIO(
                json.dumps({"assessment": assessment, "model_id": "test"}).encode()
            )
        }
        with patch.dict(os.environ, {"REASONER_ARN": "offline"}):
            self.module.handler(
                {"household_id": "owner", "incident_id": "incident", "event_id": "e21"}, None
            )
        self.module.runtime.invoke_agent_runtime.assert_called_once()
        item = self.storage.table.put_item.call_args.kwargs["Item"]
        self.assertEqual(item["status"], "assessed")
        self.assertEqual(item["context_summary"]["total_events"], 250)

    def test_changed_snapshot_is_not_sent_to_model(self):
        self.storage.get.return_value = None
        self.module.snapshot = Mock(
            return_value={"events": [], "context": {}, "active_devices": [], "severity": "warning"}
        )
        self.storage.table.get_item.side_effect = [
            {"Item": {"event_count": 1}},
            {"Item": {"event_count": 2}},
            {"Item": {"event_count": 2}},
        ]
        self.module.handler(
            {"household_id": "owner", "incident_id": "incident", "event_id": "e1"}, None
        )
        self.module.runtime.invoke_agent_runtime.assert_not_called()
        self.assertEqual(
            self.storage.table.put_item.call_args.kwargs["Item"]["failure_code"], "snapshot_changed"
        )

    def test_model_failure_is_explicit_and_retry_is_bounded(self):
        self.storage.get.return_value = None
        self.module.snapshot = Mock(
            return_value={
                "events": [{"event_id": "e1"}],
                "context": {"all_clear": False},
                "fingerprint": "a",
                "active_devices": [],
                "severity": "warning",
            }
        )
        self.storage.table.get_item.return_value = {"Item": {"event_count": 1}}
        self.module.runtime.invoke_agent_runtime.side_effect = TimeoutError("offline")
        event = {"household_id": "owner", "incident_id": "incident", "event_id": "e1"}
        with patch.dict(os.environ, {"REASONER_ARN": "offline"}):
            result = self.module.handler(event, None)
            self.assertTrue(result["retry_needed"])
            result = self.module.handler({**event, "assessment_attempt": 2}, None)
        self.assertFalse(result["retry_needed"])
        item = self.storage.table.put_item.call_args.kwargs["Item"]
        self.assertEqual(item["status"], "assessment_failed")
        self.assertNotIn("assessment", item)

    def test_repeat_reuses_citations_only_for_same_device_kind(self):
        previous = {
            "evidence_snapshot": [
                {"event_id": "old", "kind": "smoke", "source": {"source_id": "device"}}
            ],
            "assessment": {
                "incident_type": "smoke",
                "severity": "warning",
                "confidence": 0.5,
                "summary": "Reported smoke",
                "evidence_ids": ["old"],
                "uncertainties": [],
                "actions": [],
            },
        }
        events = [{"event_id": "new", "kind": "smoke", "source": {"source_id": "device"}}]
        self.assertEqual(self.module.reused_assessment(previous, events).evidence_ids, ["new"])
        with self.assertRaises(ValueError):
            self.module.reused_assessment(previous, [{**events[0], "kind": "water_leak"}])
