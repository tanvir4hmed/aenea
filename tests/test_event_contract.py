"""Ingress contract/receipt regressions using real IncidentBridge validation."""

import copy
import importlib.util
import json
import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError
from incidentbridge import normalize_event, payload_digest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions"))
from event_contract import event_state, historical_context, receipt_digest, timeline_context


class IngestionContractTests(unittest.TestCase):
    def setUp(self):
        self.device = {
            "id": str(uuid.uuid4()),
            "name": "Kitchen detector",
            "type": "smoke_detector",
            "enabled": True,
            "connection": "simulation",
            "room": "Kitchen",
            "location_id": "location-a",
        }
        self.catalog = {
            "revision": "revision-a",
            "devices": [self.device],
            "locations": [{"id": "location-a", "name": "Home", "address": "Fictional address"}],
        }
        self.payload = {
            "incident_id": str(uuid.uuid4()),
            "contract_version": "1.1",
            "state": {"alarm": "active", "connectivity": "online"},
            "adapter": "sensor",
            "event": {
                "event_id": str(uuid.uuid4()),
                "household_id": "owner",
                "occurred_at": "2026-09-28T10:00:00Z",
                "kind": "smoke",
                "source": {"source_id": self.device["id"], "category": "sensor", "simulated": True},
                "observation": "Untrusted claim: another location",
            },
        }
        self.records = {}
        self.table = Mock()
        self.table.get_item.side_effect = self.read
        self.table.put_item.side_effect = lambda **kw: self.records.update(
            {kw["Item"]["sk"]: copy.deepcopy(kw["Item"])}
        )
        self.table.update_item.side_effect = lambda **kw: self.records[kw["Key"]["sk"]].update(
            status="published"
        )
        self.env = patch.dict(
            os.environ,
            {"STATE_TABLE": "offline", "EVIDENCE_BUCKET": "offline", "EVENT_BUS": "offline"},
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        with patch("boto3.resource") as resource, patch("boto3.client"):
            resource.return_value.Table.return_value = self.table
            spec = importlib.util.spec_from_file_location(
                "contract_ingress", ROOT / "functions/ingest/handler.py"
            )
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        self.module.deleted = Mock(return_value=False)
        self.module.events = Mock()
        self.module.events.put_events.return_value = {"FailedEntryCount": 0}
        self.module.s3 = Mock()
        # Meter transactions have separate Moto integration coverage.
        self.module.charge = Mock(return_value=True)

    def read(self, **kw):
        key = kw["Key"]
        if key["sk"] == "CATALOG":
            return {"Item": self.catalog} if key["pk"] == "H#owner" else {}
        return {"Item": self.records[key["sk"]]} if key["sk"] in self.records else {}

    def send(self):
        return self.module.handler(
            {
                "body": json.dumps(self.payload),
                "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "owner"}}}},
            },
            None,
        )

    def detail(self):
        return json.loads(self.module.events.put_events.call_args.kwargs["Entries"][0]["Detail"])

    def test_registered_source_gets_trusted_context_and_separate_times(self):
        self.assertEqual(self.send()["statusCode"], 202)
        detail = self.detail()
        self.assertEqual(detail["event_context"]["location"]["name"], "Home")
        self.assertEqual(detail["event_context"]["device"]["room"], "Kitchen")
        self.assertIn("received_at", detail["event_context"])
        self.assertTrue(detail["event"]["occurred_at"].startswith("2026-09-28T10:00:00"))
        self.assertEqual(detail["event_context"]["state"], self.payload["state"])

    def test_deleted_receipt_never_publishes_or_reopens_automatic_incident(self):
        from incidentbridge import idempotency_key

        event = normalize_event(self.payload["event"], "sensor")
        self.records["INGEST#" + idempotency_key(event)] = {"status": "deleted"}
        del self.payload["incident_id"]
        self.assertEqual(self.send()["statusCode"], 410)
        self.module.events.put_events.assert_not_called()
        self.module.s3.put_object.assert_not_called()

    def test_automatic_assignment_response_and_publication_share_server_incident(self):
        assigned = str(uuid.uuid4())
        del self.payload["incident_id"]

        def reserve(table, owner, event, context, receipt):
            saved = {
                **receipt,
                "incident_id": assigned,
                "incident_name": "Home · Reported smoke",
                "routing": {"decision": "create", "mode": "agent"},
            }
            self.records[receipt["sk"]] = saved
            return saved

        with patch.object(self.module, "reserve", side_effect=reserve):
            result = self.send()
        self.assertEqual(result["statusCode"], 202)
        self.assertEqual(json.loads(result["body"])["incident_id"], assigned)
        self.assertEqual(self.detail()["incident_id"], assigned)
        self.assertEqual(self.detail()["routing"]["mode"], "agent")

    def test_unknown_disabled_or_wrong_capability_rejected_before_writes(self):
        for field, value in (
            ("id", "unknown"),
            ("enabled", False),
            ("type", "leak_sensor"),
            ("connection", "real"),
        ):
            with self.subTest(field=field):
                original = self.device[field]
                self.device[field] = value
                self.assertEqual(self.send()["statusCode"], 400)
                self.device[field] = original
        self.table.put_item.assert_not_called()
        self.module.events.put_events.assert_not_called()

    def test_spoofed_owner_category_and_real_source_rejected(self):
        self.payload["event"]["household_id"] = "other-owner"
        self.assertEqual(self.send()["statusCode"], 403)
        self.payload["event"]["household_id"] = "owner"
        self.payload["adapter"] = "webhook"
        self.payload["event"]["source"]["category"] = "camera"
        self.assertEqual(self.send()["statusCode"], 400)
        self.payload["event"]["source"].update(category="sensor", simulated=False)
        self.assertEqual(self.send()["statusCode"], 400)
        self.table.put_item.assert_not_called()

    def test_retry_does_not_publish_twice_or_reread_changed_catalog(self):
        self.send()
        self.catalog["devices"] = []
        self.assertTrue(json.loads(self.send()["body"])["duplicate"])
        self.module.events.put_events.assert_called_once()

    def test_pending_retry_preserves_context_after_catalog_deletion(self):
        self.module.events.put_events.return_value = {"FailedEntryCount": 1}
        self.assertEqual(self.send()["statusCode"], 503)
        first = self.detail()
        self.catalog["devices"] = []
        self.module.events.put_events.return_value = {"FailedEntryCount": 0}
        self.assertEqual(self.send()["statusCode"], 202)
        self.assertEqual(first, self.detail())

    def test_same_identity_with_changed_state_conflicts(self):
        self.send()
        self.payload["state"]["alarm"] = "clear"
        self.assertEqual(self.send()["statusCode"], 409)

    def test_later_reports_from_same_device_have_distinct_identity(self):
        self.send()
        self.payload["event"]["event_id"] = str(uuid.uuid4())
        self.payload["event"]["occurred_at"] = "2026-09-28T10:01:00Z"
        self.payload["state"]["alarm"] = "clear"
        self.assertEqual(self.send()["statusCode"], 202)
        self.assertEqual(len(self.records), 2)
        self.assertEqual(self.detail()["event_context"]["state"]["alarm"], "clear")

    def test_client_cannot_submit_trusted_location_context(self):
        self.payload["event_context"] = {"location": {"id": "other-property"}}
        self.assertEqual(self.send()["statusCode"], 400)
        self.table.put_item.assert_not_called()

    def test_concurrent_receipt_uses_winners_snapshot(self):
        self.send()
        winner = next(iter(self.records.values()))
        winner["status"] = "pending"
        self.table.get_item.side_effect = [{}, {"Item": self.catalog}, {}, {"Item": winner}]
        self.table.put_item.side_effect = ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException"}}, "PutItem"
        )
        self.assertEqual(self.send()["statusCode"], 202)
        self.assertEqual(self.detail()["event_context"], winner["event_context"])

    def test_legacy_registered_payload_remains_accepted_and_digest_unchanged(self):
        self.payload.pop("contract_version")
        self.payload.pop("state")
        event = normalize_event(self.payload["event"], "sensor")
        self.assertEqual(
            receipt_digest(payload_digest(event), self.payload, event_state(self.payload)),
            payload_digest(event),
        )
        self.assertEqual(self.send()["statusCode"], 202)
        self.assertEqual(self.detail()["event_context"]["state"]["alarm"], "unknown")

    def test_legacy_pending_receipt_is_not_revalidated_against_new_catalog(self):
        self.payload.pop("contract_version")
        self.payload.pop("state")
        self.module.events.put_events.return_value = {"FailedEntryCount": 1}
        self.send()
        next(iter(self.records.values())).pop("event_context")
        self.catalog["devices"] = []
        self.module.events.put_events.return_value = {"FailedEntryCount": 0}
        self.assertEqual(self.send()["statusCode"], 202)
        self.assertEqual(historical_context(self.detail())["provenance"], "legacy_unverified")

    def test_bad_state_or_unknown_version_rejected(self):
        for update in (
            {"contract_version": "9.0"},
            {"state": {"alarm": "safe", "connectivity": "online"}},
            {"state": {"alarm": "clear"}},
            {"contract_version": "1.0"},
        ):
            with self.subTest(update=update):
                payload = copy.deepcopy(self.payload)
                self.payload.update(update)
                self.assertEqual(self.send()["statusCode"], 400)
                self.payload = payload
        self.table.put_item.assert_not_called()

    def test_historical_read_migration_is_nondestructive(self):
        item = {"event": self.payload["event"]}
        migrated = timeline_context(item)
        self.assertNotIn("event_context", item)
        self.assertEqual(migrated["event"], item["event"])
        self.assertEqual(migrated["event_context"]["state"]["alarm"], "unknown")
        self.assertNotIn("location", migrated["event_context"])
