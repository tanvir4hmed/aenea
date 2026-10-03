"""Offline end-to-end boundaries: real persistence/policy, synthetic model responses."""

import copy
import json
import time
import unittest
import uuid
from decimal import Decimal
from unittest.mock import Mock, patch

import test_simulation_runs as fixture
from incident_engine import resolve
from incident_notes import save_note, latest_notes
from simulation_library import save_library, read_library
from simulation_runs import start, selection, command
from simulation_budget import read_budget
from model_context import bounded_payload
from briefings import record
from revisions import current_assessment


@patch.dict("os.environ", {"DEVICE_ACTIONS_ENABLED": "true"})
class LiveCoordinationTests(unittest.TestCase):
    setUp = fixture.SimulationRunTests.setUp
    setup_run = fixture.SimulationRunTests.setup_run
    tick = fixture.SimulationRunTests.tick
    deliver = fixture.SimulationRunTests.deliver

    def incident(self):
        _, run = self.setup_run()
        run = self.tick(run)
        return run["incident_ids"][0]

    def assessment(self, incident, capability="virtual_lights", action="lights_on"):
        event = json.loads(self.ingest.events.put_events.call_args.kwargs["Entries"][0]["Detail"])[
            "event"
        ]
        identifier = uuid.uuid4().hex
        item = {
            "pk": f"H#owner#I#{incident}",
            "sk": "ASSESSMENT#" + identifier,
            "assessment_id": identifier,
            "status": "assessed",
            "evidence_revision": 1,
            "expires_at": int(time.time()) + 300,
            "evidence_ids": [event["event_id"]],
            "assessment": {
                "incident_type": event["kind"],
                "severity": "warning",
                "confidence": 0.5,
                "summary": "A synthetic sensor is active; cause unverified.",
                "uncertainties": ["Cause unknown"],
                "evidence_ids": [event["event_id"]],
                "actions": [
                    {
                        "device_id": capability,
                        "action": action,
                        "rationale": "Reported evidence",
                        "evidence_ids": [event["event_id"]],
                    }
                ],
            },
        }
        from incident_engine import attrs
        import boto3

        boto3.client("dynamodb").put_item(
            TableName=self.table.name, Item=attrs(json.loads(json.dumps(item), parse_float=Decimal))
        )
        self.table.update_item(
            Key={"pk": "H#owner", "sk": "INCIDENT#" + incident},
            UpdateExpression="SET latest_assessment = :id, decision_review = :review",
            ExpressionAttributeValues={":id": identifier, ":review": "unreviewed"},
        )
        return item

    def outputs(self, kind="light"):
        home, away = str(uuid.uuid4()), str(uuid.uuid4())
        self.catalog["locations"].append({"id": "other", "name": "Office", "address": ""})
        for identifier, location in [(home, self.location), (away, "other")]:
            self.catalog["devices"].append(
                {
                    "id": identifier,
                    "location_id": location,
                    "room": "Hall",
                    "type": kind,
                    "name": identifier,
                    "enabled": True,
                    "connection": "simulation",
                }
            )
        self.table.put_item(Item={"pk": "H#owner", "sk": "CATALOG", **self.catalog})
        self.table.put_item(
            Item={
                "pk": "H#owner",
                "sk": "PROFILE",
                "revision": "settings-v1",
                "devices": {
                    identity: {"enabled": True, "preauthorized": True, "fail_next": False}
                    for identity in (home, away)
                },
            }
        )
        return home, away

    def modules(self):
        coordination = fixture.load("live_coordination", "functions/coordination.py")
        with patch.dict("sys.modules", {"coordination": coordination}):
            policy = fixture.load("live_policy", "functions/policy/handler.py")
        return coordination, policy

    def test_registered_output_is_location_scoped_and_executes_once(self):
        incident = self.incident()
        home, away = self.outputs()
        assessment = self.assessment(incident)
        coordination, policy = self.modules()
        result = policy.handler(
            {
                "household_id": "owner",
                "incident_id": incident,
                "assessment_id": assessment["assessment_id"],
            },
            None,
        )
        self.assertEqual(len(result["action_ids"]), 1)
        action = result["action_ids"][0]
        self.assertEqual(coordination.execute("owner", incident, action)["status"], "succeeded")
        self.assertEqual(coordination.execute("owner", incident, action)["status"], "succeeded")
        self.assertTrue(
            self.table.get_item(Key={"pk": "H#owner", "sk": "DEVICE#" + home}).get("Item")
        )
        self.assertFalse(
            self.table.get_item(Key={"pk": "H#owner", "sk": "DEVICE#" + away}).get("Item")
        )

    def test_notes_are_idempotent_and_invalidate_decision_and_resolution(self):
        incident = self.incident()
        assessment = self.assessment(incident)
        body = {"request_id": str(uuid.uuid4()), "text": "Synthetic additional context"}
        import boto3

        real_client = boto3.client
        events = Mock()
        events.put_events.return_value = {"FailedEntryCount": 0}
        with patch(
            "incident_notes.boto3.client",
            side_effect=lambda service: events if service == "events" else real_client(service),
        ):
            self.assertEqual(save_note(self.table, "owner", incident, body)["statusCode"], 200)
            self.assertEqual(save_note(self.table, "owner", incident, body)["statusCode"], 200)
            with self.assertRaises(ValueError):
                save_note(self.table, "owner", incident, {**body, "text": "Different"})
        summary = self.table.get_item(Key={"pk": "H#owner", "sk": "INCIDENT#" + incident})["Item"]
        self.assertEqual(summary["note_revision"], 1)
        self.assertFalse(current_assessment(summary, assessment))
        self.assertEqual(latest_notes(self.table, "owner", incident)["total"], 1)
        self.assertEqual(
            resolve(self.table, "owner", incident, {"confirm": True, "revision": 1})["statusCode"],
            409,
        )
        self.assertEqual(
            resolve(
                self.table, "owner", incident, {"confirm": True, "revision": 1, "note_revision": 1}
            )["statusCode"],
            200,
        )
        self.assertEqual(
            save_note(self.table, "owner", incident, {**body, "request_id": str(uuid.uuid4())})[
                "statusCode"
            ],
            409,
        )

    def test_material_briefings_persist_and_repeated_reads_stay_quiet(self):
        incident = self.incident()
        self.assessment(incident)
        first = record(self.table, "owner", incident)
        second = record(self.table, "owner", incident)
        self.assertEqual(first["id"], second["id"])
        self.assertIn("1 devices reporting", first["text"])
        self.assertEqual(
            resolve(self.table, "owner", incident, {"confirm": True, "revision": 1})["statusCode"],
            200,
        )
        closed = record(self.table, "owner", incident)
        self.assertNotEqual(closed["id"], first["id"])
        self.assertTrue(closed["resolved"])
        self.assertIn("does not certify safety", closed["text"])

    def test_moved_output_cannot_use_old_proposal(self):
        incident = self.incident()
        home, _ = self.outputs()
        assessment = self.assessment(incident)
        coordination, policy = self.modules()
        result = policy.handler(
            {
                "household_id": "owner",
                "incident_id": incident,
                "assessment_id": assessment["assessment_id"],
            },
            None,
        )
        self.catalog["revision"] = str(uuid.uuid4())
        next(device for device in self.catalog["devices"] if device["id"] == home)[
            "location_id"
        ] = "other"
        self.table.put_item(Item={"pk": "H#owner", "sk": "CATALOG", **self.catalog})
        outcome = coordination.execute("owner", incident, result["action_ids"][0])
        self.assertEqual(outcome["status"], "blocked")
        self.assertFalse(
            self.table.get_item(Key={"pk": "H#owner", "sk": "DEVICE#" + home}).get("Item")
        )

    def test_full_library_pages_and_all_named_overlap_sources(self):
        second = {**self.catalog["devices"][0], "id": str(uuid.uuid4()), "name": "Second"}
        self.catalog["devices"].append(second)
        self.table.put_item(Item={"pk": "H#owner", "sk": "CATALOG", **self.catalog})
        definitions = []
        for index in range(250):
            definitions.append(
                {
                    **copy.deepcopy(self.item),
                    "id": str(uuid.uuid4()),
                    "name": f"Scenario {index}",
                    "type": "scenario",
                    "signals": [
                        copy.deepcopy(self.item["signals"][0]),
                        {"deviceId": second["id"], "kind": "smoke", "observation": "Synthetic"},
                    ],
                }
            )
        result = save_library(self.table, "owner", {"revision": None, "items": definitions})
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(len(read_library(self.table, "owner")["items"]), 250)
        with self.assertRaisesRegex(ValueError, "Scenario 0.*Scenario 1"):
            selection(definitions, [row["id"] for row in definitions[:2]], self.catalog)

    def test_new_incident_receives_fresh_allowance(self):
        first = self.incident()
        resolve(self.table, "owner", first, {"confirm": True, "revision": 1})
        with patch("simulation_runs.time.time", return_value=int(time.time()) + 5):
            _, run = self.setup_run()
            result = self.tick(run)
        second = result["incident_ids"][0]
        self.assertNotEqual(first, second)
        self.assertEqual(
            read_budget(self.table, "owner", second), {"used": 1, "limit": 2000, "maximum": 10000}
        )

    def test_context_transport_bounds_do_not_change_source_evidence(self):
        events = [{"event_id": str(index), "observation": "界" * 1000} for index in range(32)]
        result = bounded_payload(
            events, {"total_events": 900, "sampled": False}, {"items": [], "total": 0}, {}
        )
        self.assertLess(len(json.dumps(result).encode()), 60001)
        self.assertEqual(len(events), 32)
        self.assertEqual(result["state_summary"]["total_events"], 900)
        self.assertTrue(result["state_summary"]["sampled"])

    def test_same_location_other_incident_smoke_vetoes_valve(self):
        self.catalog["devices"][0]["type"] = "leak_sensor"
        self.item["signals"][0]["kind"] = "water_leak"
        self.table.put_item(Item={"pk": "H#owner", "sk": "CATALOG", **self.catalog})
        incident = self.incident()
        valve, _ = self.outputs("water_valve")
        assessment = self.assessment(incident, "virtual_valve", "close_valve")
        coordination, policy = self.modules()
        result = policy.handler(
            {
                "household_id": "owner",
                "incident_id": incident,
                "assessment_id": assessment["assessment_id"],
            },
            None,
        )
        action = result["action_ids"][0]
        self.assertEqual(
            coordination.get("owner", incident, "ACTION#" + action)["status"],
            "pending_confirmation",
        )
        self.device = str(uuid.uuid4())
        self.catalog["devices"].append(
            {
                "id": self.device,
                "location_id": self.location,
                "room": "Kitchen",
                "type": "smoke_detector",
                "name": "Smoke",
                "enabled": True,
                "connection": "simulation",
            }
        )
        self.table.put_item(Item={"pk": "H#owner", "sk": "CATALOG", **self.catalog})
        self.item["signals"] = [
            {"deviceId": self.device, "kind": "smoke", "observation": "Synthetic smoke"}
        ]
        _, run = self.setup_run()
        smoke = self.tick(run)["incident_ids"][0]
        self.assertNotEqual(smoke, incident)
        self.assertEqual(
            coordination.execute(
                "owner",
                incident,
                action,
                confirmed=True,
                expected_assessment=assessment["assessment_id"],
            )["status"],
            "blocked",
        )
        self.assertFalse(
            self.table.get_item(Key={"pk": "H#owner", "sk": "DEVICE#" + valve}).get("Item")
        )

    def test_synthetic_failure_flag_consumed_without_output_or_retry_execution(self):
        incident = self.incident()
        home, _ = self.outputs()
        settings = self.table.get_item(Key={"pk": "H#owner", "sk": "PROFILE"})["Item"]
        settings["devices"][home]["fail_next"] = True
        self.table.put_item(Item=settings)
        assessment = self.assessment(incident)
        coordination, policy = self.modules()
        result = policy.handler(
            {
                "household_id": "owner",
                "incident_id": incident,
                "assessment_id": assessment["assessment_id"],
            },
            None,
        )
        action = result["action_ids"][0]
        self.assertEqual(coordination.execute("owner", incident, action)["status"], "failed")
        self.assertEqual(coordination.execute("owner", incident, action)["status"], "failed")
        self.assertFalse(coordination.profile("owner")["devices"][home]["fail_next"])
        self.assertFalse(
            self.table.get_item(Key={"pk": "H#owner", "sk": "DEVICE#" + home}).get("Item")
        )

    def test_worker_delivery_failure_is_visible_and_pending_identity_survives(self):
        _, run = self.setup_run()
        worker = fixture.load("live_worker", "functions/simulation_worker/handler.py")
        worker.deliver = Mock(side_effect=RuntimeError("Transport failure"))
        context = Mock()
        context.get_remaining_time_in_millis.return_value = 170000
        worker.handler({}, context)
        from simulation_runs import get_run

        paused = get_run(self.table, "owner", run["id"])
        self.assertEqual(paused["status"], "paused")
        self.assertIn("pending", paused["rows"][0])
        self.assertEqual(paused["accepted"], 0)
        worker.deliver = self.deliver
        command(self.table, "owner", run["id"], {"action": "resume"})
        worker.handler({}, context)
        self.assertEqual(get_run(self.table, "owner", run["id"])["status"], "completed")
