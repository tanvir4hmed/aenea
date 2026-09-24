"""Mocked deletion scope, drain window, retries and versioned-object cleanup."""
import importlib.util
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions"))
from lifecycle import request_deletion

INCIDENT = "11111111-1111-4111-8111-111111111111"


class DeletionRequestTests(unittest.TestCase):
    def test_requires_exact_confirmation_without_writes(self):
        table = Mock()
        self.assertEqual(request_deletion(table, "owner", INCIDENT, {"confirm_incident_id": "other"})["statusCode"], 400)
        table.get_item.assert_not_called()

    def test_request_marks_incident_and_job_in_one_transaction(self):
        table = Mock(name="table")
        table.name = "offline"
        table.get_item.return_value = {}
        client = Mock()
        with patch("lifecycle.boto3.client", return_value=client), patch("lifecycle.time.time", return_value=1000):
            result = request_deletion(table, "owner", INCIDENT, {"confirm_incident_id": INCIDENT})
        self.assertEqual(result["statusCode"], 202)
        ops = client.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(len(ops), 3)
        self.assertEqual(ops[0]["Put"]["Item"]["eligible_at"], {"N": "1900"})
        self.assertEqual(ops[1]["Update"]["Key"]["pk"], {"S": "H#owner"})
        self.assertEqual(ops[1]["Update"]["ConditionExpression"], "attribute_exists(pk)")

    def test_duplicate_request_does_not_restart_drain_window(self):
        table = Mock()
        table.get_item.return_value = {"Item": {"cleanup_status": "pending", "eligible_at": 1900}}
        with patch("lifecycle.boto3.client") as client:
            self.assertEqual(request_deletion(table, "owner", INCIDENT, {"confirm_incident_id": INCIDENT})["statusCode"], 200)
        client.assert_not_called()


class CleanupWorkerTests(unittest.TestCase):
    def setUp(self):
        self.table, self.s3 = Mock(), Mock()
        resource = Mock()
        resource.Table.return_value = self.table
        spec = importlib.util.spec_from_file_location("isolated_cleanup", ROOT / "functions/cleanup/handler.py")
        self.module = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {"STATE_TABLE": "offline"}), patch("boto3.resource", return_value=resource), patch("boto3.client", return_value=self.s3):
            spec.loader.exec_module(self.module)
        self.context = Mock()
        self.context.get_remaining_time_in_millis.return_value = 100000
        self.job = {"pk": "CLEANUP", "sk": "JOB#owner#" + INCIDENT, "owner": "owner", "incident_id": INCIDENT}
        self.module.deleted = Mock(return_value={"cleanup_status": "pending", "eligible_at": 0})
        self.table.query.side_effect = [{"Items": []}, {"Items": []}]
        self.writer = Mock()
        self.table.batch_writer.return_value = Mock(__enter__=Mock(return_value=self.writer), __exit__=Mock(return_value=False))

    def test_drain_window_prevents_early_purge(self):
        self.module.deleted.return_value["eligible_at"] = 9999999999
        self.module.purge(self.job, self.context)
        self.s3.list_object_versions.assert_not_called()
        self.table.delete_item.assert_not_called()

    def test_missing_marker_never_deletes_data(self):
        self.module.deleted.return_value = None
        self.module.purge(self.job, self.context)
        self.s3.list_object_versions.assert_not_called()

    def test_purges_versions_and_delete_markers_at_exact_prefix(self):
        key = f"owner/{INCIDENT}/event.json"
        self.s3.list_object_versions.side_effect = [{"Versions": [{"Key": key, "VersionId": "v1"}], "DeleteMarkers": [{"Key": key, "VersionId": "v2"}]}, {}]
        self.s3.delete_objects.return_value = {}
        with patch.dict(os.environ, {"EVIDENCE_BUCKET": "offline"}):
            self.module.purge(self.job, self.context)
        objects = self.s3.delete_objects.call_args.kwargs["Delete"]["Objects"]
        self.assertEqual({item["VersionId"] for item in objects}, {"v1", "v2"})
        self.assertEqual(self.s3.list_object_versions.call_args.kwargs["Prefix"], f"owner/{INCIDENT}/")
        self.assertEqual(self.table.update_item.call_args.kwargs["ExpressionAttributeValues"][":state"], "completed")
        for call in self.table.delete_item.call_args_list[:4]:
            self.assertEqual(call.kwargs["ConditionExpression"], "incident_id = :incident")

    def test_s3_partial_failure_cannot_mark_completed(self):
        self.s3.list_object_versions.return_value = {"Versions": [{"Key": f"owner/{INCIDENT}/event.json", "VersionId": "v1"}]}
        self.s3.delete_objects.return_value = {"Errors": [{"Code": "AccessDenied"}]}
        with patch.dict(os.environ, {"EVIDENCE_BUCKET": "offline"}), self.assertRaises(RuntimeError):
            self.module.purge(self.job, self.context)
        self.table.delete_item.assert_not_called()

    def test_receipts_for_other_incidents_are_preserved(self):
        self.s3.list_object_versions.return_value = {}
        self.table.query.side_effect = [{"Items": []}, {"Items": [{"pk": "H#owner", "sk": "INGEST#one", "incident_id": INCIDENT}, {"pk": "H#owner", "sk": "INGEST#two", "incident_id": "another"}]}]
        with patch.dict(os.environ, {"EVIDENCE_BUCKET": "offline"}):
            self.module.purge(self.job, self.context)
        self.writer.delete_item.assert_called_once_with(Key={"pk": "H#owner", "sk": "INGEST#one"})
