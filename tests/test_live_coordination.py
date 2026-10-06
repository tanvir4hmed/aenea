"""Offline end-to-end boundaries: real persistence and briefing, synthetic model responses."""

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
from simulation_runs import selection, command
from simulation_budget import read_budget
from model_context import bounded_payload
from briefings import record
from revisions import current_assessment


class LiveCoordinationTests(unittest.TestCase):
    setUp = fixture.SimulationRunTests.setUp
    setup_run = fixture.SimulationRunTests.setup_run
    tick = fixture.SimulationRunTests.tick
    deliver = fixture.SimulationRunTests.deliver

    def incident(self):
        _, run = self.setup_run()
        run = self.tick(run)
        return run["incident_ids"][0]

    def assessment(self, incident):
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
                "actions": [],
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
            events, {"total_events": 900, "sampled": False}, {"items": [], "total": 0}
        )
        self.assertLess(len(json.dumps(result).encode()), 60001)
        self.assertEqual(len(events), 32)
        self.assertEqual(result["state_summary"]["total_events"], 900)
        self.assertTrue(result["state_summary"]["sampled"])

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
