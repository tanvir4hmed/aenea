"""Offline DynamoDB transaction and paginated state regressions (no AWS account)."""

import importlib.util
import json
import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import boto3
from incidentbridge import idempotency_key, normalize_event
from moto import mock_aws

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions"))
sys.path.insert(0, str(ROOT / "shared"))
import incident_engine as engine
from incident_state import snapshot, assessed_severity
from lifecycle import request_deletion


class IncidentEngineTests(unittest.TestCase):
    def setUp(self):
        self.aws = mock_aws()
        self.aws.start()
        self.addCleanup(self.aws.stop)
        env = patch.dict(os.environ, {"AWS_DEFAULT_REGION": "us-east-1", "STATE_TABLE": "state"})
        env.start()
        self.addCleanup(env.stop)
        self.table = boto3.resource("dynamodb").create_table(
            TableName="state",
            BillingMode="PAY_PER_REQUEST",
            KeySchema=[
                {"AttributeName": key, "KeyType": kind}
                for key, kind in [("pk", "HASH"), ("sk", "RANGE")]
            ],
            AttributeDefinitions=[
                {"AttributeName": key, "AttributeType": "S"} for key in ("pk", "sk")
            ],
        )
        self.real_propose = engine.propose_name
        naming = patch.object(
            engine,
            "propose_name",
            side_effect=lambda event, context, candidate=None: (
                candidate["name"] if candidate else "Home · Reported smoke",
                {
                    "mode": "agent",
                    "decision": "join" if candidate else "create",
                    "reason": "Same trusted property",
                },
            ),
        )
        self.naming = naming.start()
        self.addCleanup(naming.stop)
        spec = importlib.util.spec_from_file_location(
            "engine_correlate", ROOT / "functions/correlate/handler.py"
        )
        self.correlate = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.correlate)

    def event(self, device="detector-a", kind="smoke", offset=0):
        camera = kind in {"motion", "doorbell", "package", "vehicle", "person_detected"}
        return normalize_event(
            {
                "event_id": str(uuid.uuid4()),
                "household_id": "owner",
                "occurred_at": (datetime.now(timezone.utc) + timedelta(seconds=offset)).isoformat(),
                "kind": kind,
                "source": {
                    "source_id": device,
                    "category": "camera" if camera else "sensor",
                    "simulated": True,
                },
                "observation": "Reported alarm",
            },
            "camera-simulator" if camera else "sensor",
        )

    def context(self, location="home", alarm="active"):
        return {
            "contract_version": "1.1",
            "received_at": datetime.now(timezone.utc).isoformat(),
            "location": {"id": location, "name": location, "address": "Synthetic"},
            "device": {"room": "Kitchen"},
            "state": {"alarm": alarm, "connectivity": "online"},
        }

    def reserve(self, event, context=None):
        context = context or self.context()
        return engine.reserve(
            self.table,
            "owner",
            event,
            context,
            {
                "pk": "H#owner",
                "sk": "INGEST#" + idempotency_key(event),
                "request_target": "auto",
                "event_context": context,
                "status": "pending",
                "digest": "test",
            },
        )

    def append(self, event, receipt):
        return self.correlate.handler(
            {
                "event": event.model_dump(mode="json"),
                "incident_id": receipt["incident_id"],
                "incident_name": receipt["incident_name"],
                "idempotency_key": idempotency_key(event),
                "evidence_key": "test",
                "event_context": receipt["event_context"],
                "routing": receipt["routing"],
            },
            None,
        )

    def summary(self, incident):
        return self.table.get_item(Key={"pk": "H#owner", "sk": "INCIDENT#" + incident})["Item"]

    def test_related_alerts_join_and_other_property_or_hazard_separates(self):
        first = self.reserve(self.event())
        self.assertEqual(
            first["incident_id"],
            self.reserve(self.event("detector-b", "carbon_monoxide"))["incident_id"],
        )
        self.assertNotEqual(
            first["incident_id"], self.reserve(self.event(), self.context("office"))["incident_id"]
        )
        self.assertNotEqual(
            first["incident_id"], self.reserve(self.event("leak", "water_leak"))["incident_id"]
        )

    def test_repeated_source_reuses_route_without_another_model_call(self):
        first = self.reserve(self.event())
        repeat = self.reserve(self.event())
        self.assertEqual(repeat["incident_id"], first["incident_id"])
        self.assertEqual(repeat["routing"]["mode"], "validated_route_reuse")
        self.naming.assert_called_once()
        joined = self.reserve(self.event("detector-b"))
        self.assertEqual(joined["routing"]["decision"], "join")
        self.assertEqual(self.naming.call_count, 2)

    def test_routing_outage_marks_fallback_instead_of_inventing_model_result(self):
        with patch.object(engine.boto3, "client", side_effect=TimeoutError("offline")):
            name, routing = self.real_propose(self.event(), self.context())
        self.assertIn("smoke", name)
        self.assertEqual(routing["mode"], "deterministic_fallback")
        self.assertNotIn("model_id", routing)

    def test_simultaneous_first_event_retries_route_race_without_orphan(self):
        real_client = boto3.client("dynamodb")
        real_write = real_client.transact_write_items
        winner = []

        def raced(**kwargs):
            if not winner:
                # A second sender commits between the first sender's read and write.
                winner.append(self.reserve(self.event("detector-b")))
            return real_write(**kwargs)

        with patch.object(engine.boto3, "client", return_value=real_client):
            # Avoid recursive interception of the competing sender.
            def intercept(**kwargs):
                with patch.object(real_client, "transact_write_items", side_effect=real_write):
                    return raced(**kwargs)

            with patch.object(real_client, "transact_write_items", side_effect=intercept):
                receipt = self.reserve(self.event())
        self.assertEqual(receipt["incident_id"], winner[0]["incident_id"])
        incidents = [r for r in self.table.scan()["Items"] if r["sk"].startswith("INCIDENT#")]
        self.assertEqual(len(incidents), 1)

    def test_resolve_revision_guard_new_activity_and_old_retry_identity(self):
        event = self.event()
        receipt = self.reserve(event)
        incident = receipt["incident_id"]
        self.append(event, receipt)
        self.append(event, receipt)
        self.assertEqual(self.summary(incident)["event_count"], 1)
        self.assertEqual(
            engine.resolve(self.table, "owner", incident, {"confirm": True, "revision": 0})[
                "statusCode"
            ],
            409,
        )
        self.assertEqual(
            engine.resolve(self.table, "owner", incident, {"confirm": True, "revision": 1})[
                "statusCode"
            ],
            200,
        )
        self.assertEqual(self.reserve(event)["incident_id"], incident)
        with self.assertRaises(ValueError):
            self.reserve(self.event(offset=-60))
        self.assertNotEqual(self.reserve(self.event(offset=1))["incident_id"], incident)

    def test_accepted_late_delivery_archives_without_reopening(self):
        event = self.event()
        receipt = self.reserve(event)
        incident = receipt["incident_id"]
        engine.resolve(self.table, "owner", incident, {"confirm": True, "revision": 0})
        self.assertTrue(self.append(event, receipt)["deleted"])
        self.assertEqual(self.summary(incident)["event_count"], 0)
        self.assertEqual(self.summary(incident)["lifecycle"], "resolved")
        self.assertEqual(snapshot(self.table, "owner", incident)["active_devices"], [])

    def test_deletion_closes_route_and_preserves_replay_boundary_after_purge(self):
        event = self.event()
        receipt = self.reserve(event)
        incident = receipt["incident_id"]
        self.assertEqual(
            request_deletion(self.table, "owner", incident, {"confirm_incident_id": incident})[
                "statusCode"
            ],
            202,
        )
        self.assertTrue(self.append(event, receipt)["deleted"])
        self.table.delete_item(Key={"pk": "H#owner", "sk": "INCIDENT#" + incident})
        with self.assertRaises(ValueError):
            self.reserve(self.event(offset=-60))
        self.assertNotEqual(self.reserve(self.event(offset=1))["incident_id"], incident)

    def put_state(self, incident, event, alarm="active"):
        self.table.put_item(
            Item={
                "pk": "H#owner#I#" + incident,
                "sk": "EVENT#" + event.occurred_at.isoformat() + "#" + event.event_id,
                "event": event.model_dump(mode="json"),
                "event_context": self.context(alarm=alarm),
            }
        )

    def test_paged_history_over_200_retains_all_and_bounds_model_context(self):
        for index in range(250):
            self.put_state("long", self.event("device-" + str(index % 40), offset=index))
        state = snapshot(self.table, "owner", "long")
        self.assertEqual(state["context"]["total_events"], 250)
        self.assertEqual(len(state["policy_events"]), 40)
        self.assertEqual(len(state["events"]), 32)
        self.assertTrue(state["context"]["sampled"])
        self.assertEqual(state["severity"], "urgent")

    def test_clear_rearm_out_of_order_and_repeats_are_not_extra_detectors(self):
        self.put_state("state", self.event(offset=1))
        self.put_state("state", self.event(offset=2))
        self.assertEqual(snapshot(self.table, "owner", "state")["severity"], "warning")
        self.put_state("state", self.event(offset=4), "clear")
        self.put_state("state", self.event(offset=3))
        state = snapshot(self.table, "owner", "state")
        self.assertTrue(state["context"]["all_clear"])
        self.assertEqual(state["policy_events"], [])
        self.put_state("state", self.event(offset=5))
        self.assertEqual(len(snapshot(self.table, "owner", "state")["active_devices"]), 1)

    def test_model_urgency_can_raise_one_device_but_never_lower_floor(self):
        event = self.event()
        self.put_state("state", event)
        state = snapshot(self.table, "owner", "state")
        severity, devices = assessed_severity(
            state, {"severity": "urgent", "evidence_ids": [event.event_id]}
        )
        self.assertEqual((severity, devices[0]["level"]), ("urgent", "red"))
        self.assertEqual(assessed_severity(state, {"severity": "informational"})[0], "warning")

    def test_reporting_devices_include_latest_clear_unknown_and_original_metadata(self):
        clear = self.event("detector-clear", offset=2)
        unknown = self.event("detector-unknown", offset=3)
        self.put_state("reports", self.event("detector-clear", offset=1))
        self.put_state("reports", clear, "clear")
        self.put_state("reports", unknown, "unknown")
        state = snapshot(self.table, "owner", "reports")
        self.assertEqual(len(state["reporting_devices"]), 2)
        self.assertEqual(len(state["active_devices"]), 1)
        self.assertEqual(state["unknown_device_count"], 1)
        self.assertEqual(state["last_reported_at"], unknown.model_dump(mode="json")["occurred_at"])
        self.assertEqual({row["alarm"] for row in state["reporting_devices"]}, {"clear", "unknown"})
        self.assertTrue(all(row["room"] == "Kitchen" for row in state["reporting_devices"]))

    def test_multi_signal_device_is_counted_once_and_keeps_all_kinds(self):
        self.put_state("reports", self.event("camera", "motion", offset=1))
        self.put_state("reports", self.event("camera", "doorbell", offset=2), "clear")
        state = snapshot(self.table, "owner", "reports")
        self.assertEqual(len(state["reporting_devices"]), 1)
        device = state["reporting_devices"][0]
        self.assertEqual(device["alarm"], "active")
        self.assertEqual(set(device["kinds"]), {"motion", "doorbell"})

    def test_signal_tiers_keep_normal_ring_context_low_and_escalate_only_defined_cases(self):
        self.put_state("doorbell", self.event("front-ring", "doorbell"))
        low = snapshot(self.table, "owner", "doorbell")
        self.assertEqual(
            (low["severity"], low["active_devices"][0]["level"]), ("informational", "normal")
        )
        self.put_state("smoke", self.event("kitchen-one", "smoke"))
        self.assertEqual(snapshot(self.table, "owner", "smoke")["severity"], "warning")
        self.put_state("smoke", self.event("kitchen-two", "heat", offset=1))
        escalated = snapshot(self.table, "owner", "smoke")
        self.assertEqual(escalated["severity"], "urgent")
        self.assertEqual({row["level"] for row in escalated["active_devices"]}, {"red"})
        self.put_state("security", self.event("panel", "security_alarm"))
        self.assertEqual(snapshot(self.table, "owner", "security")["severity"], "urgent")


if __name__ == "__main__":
    unittest.main()
