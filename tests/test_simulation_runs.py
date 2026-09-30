"""Server simulation state, durable delivery and allowance tests against offline DynamoDB."""

import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
import uuid
from unittest.mock import Mock, patch
import boto3
from moto import mock_aws

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "functions"), str(ROOT / "shared")]
from simulation_profiles import DEFAULT_PROFILE, expected_count, validate_profile
from simulation_library import save_library, read_library, validate_library
from simulation_runs import start, get_run, work, command
from simulation_budget import read_budget, key as budget_key, extend
from incident_engine import resolve


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class SimulationRunTests(unittest.TestCase):
    def setUp(self):
        aws = mock_aws()
        aws.start()
        self.addCleanup(aws.stop)
        env = patch.dict(
            os.environ,
            {
                "AWS_DEFAULT_REGION": "us-east-1",
                "STATE_TABLE": "state",
                "EVIDENCE_BUCKET": "offline",
                "EVENT_BUS": "offline",
            },
        )
        env.start()
        self.addCleanup(env.stop)
        self.table = boto3.resource("dynamodb").create_table(
            TableName="state",
            BillingMode="PAY_PER_REQUEST",
            KeySchema=[
                {"AttributeName": "pk", "KeyType": "HASH"},
                {"AttributeName": "sk", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": key, "AttributeType": "S"} for key in ("pk", "sk")
            ],
        )
        self.location, self.device, self.definition = [str(uuid.uuid4()) for _ in range(3)]
        self.catalog = {
            "revision": str(uuid.uuid4()),
            "locations": [{"id": self.location, "name": "Home", "address": "Synthetic"}],
            "devices": [
                {
                    "id": self.device,
                    "location_id": self.location,
                    "room": "Kitchen",
                    "type": "smoke_detector",
                    "name": "Kitchen smoke",
                    "enabled": True,
                    "connection": "simulation",
                }
            ],
        }
        self.table.put_item(Item={"pk": "H#owner", "sk": "CATALOG", **self.catalog})
        self.item = {
            "id": self.definition,
            "name": "Smoke",
            "type": "single",
            "signals": [
                {"deviceId": self.device, "kind": "smoke", "observation": "Synthetic alarm"}
            ],
            "profile": dict(DEFAULT_PROFILE),
        }
        self.ingest = load("run_ingest", "functions/ingest/handler.py")
        self.correlate = load("run_correlate", "functions/correlate/handler.py")
        self.ingest.s3 = Mock()
        self.ingest.events = Mock()
        self.ingest.events.put_events.return_value = {"FailedEntryCount": 0}
        naming = patch(
            "incident_engine.propose_name",
            return_value=("Home smoke", {"mode": "agent", "decision": "create"}),
        )
        naming.start()
        self.addCleanup(naming.stop)

    def setup_run(self, profile=None):
        if profile:
            self.item["profile"] = profile
        library = read_library(self.table, "owner")
        self.assertEqual(
            save_library(
                self.table, "owner", {"revision": library["revision"], "items": [self.item]}
            )["statusCode"],
            200,
        )
        request = {
            "request_id": str(uuid.uuid4()),
            "definition_ids": [self.definition],
            "incident_id": None,
        }
        result = start(self.table, "owner", request)
        self.assertEqual(result["statusCode"], 202)
        return request, get_run(self.table, "owner", request["request_id"])

    def deliver(self, owner, payload):
        response = self.ingest.handler(
            {
                "body": json.dumps(payload),
                "requestContext": {"authorizer": {"jwt": {"claims": {"sub": owner}}}},
            },
            None,
        )
        if response["statusCode"] == 202 and not json.loads(response["body"]).get("duplicate"):
            self.correlate.handler(
                json.loads(self.ingest.events.put_events.call_args.kwargs["Entries"][0]["Detail"]),
                None,
            )
        return response

    def tick(self, run, at=None):
        with patch("simulation_runs.time.time", return_value=at or run["created_at"]):
            work(self.table, "owner", run, self.deliver, lambda: 170000)
        return get_run(self.table, "owner", run["id"])

    def test_cleanup_finds_run_after_ingress_loses_its_response(self):
        from boto3.dynamodb.conditions import Key
        from lifecycle import request_deletion, marker_key

        _, run = self.setup_run()
        self.ingest.s3.put_object.side_effect = RuntimeError("Uncertain delivery")
        with self.assertRaises(RuntimeError):
            self.tick(run)
        stored = get_run(self.table, "owner", run["id"])
        self.assertFalse(stored["incident_ids"])
        self.assertTrue(stored["rows"][0]["pending"])
        receipt = self.table.query(
            KeyConditionExpression=Key("pk").eq("H#owner") & Key("sk").begins_with("INGEST#")
        )["Items"][0]
        incident = receipt["incident_id"]
        response = request_deletion(
            self.table, "owner", incident, {"confirm_incident_id": incident}
        )
        self.assertEqual(response["statusCode"], 202)
        self.table.update_item(
            Key=marker_key("owner", incident),
            UpdateExpression="SET eligible_at = :zero",
            ExpressionAttributeValues={":zero": 0},
        )
        cleanup = load("uncertain_cleanup", "functions/cleanup/handler.py")
        cleanup.s3 = Mock()
        cleanup.s3.list_object_versions.return_value = {}
        cleanup.purge(
            {
                "pk": "CLEANUP",
                "sk": f"JOB#owner#{incident}",
                "owner": "owner",
                "incident_id": incident,
            },
            Mock(get_remaining_time_in_millis=Mock(return_value=170000)),
        )
        self.assertFalse(
            self.table.get_item(Key={"pk": "H#owner", "sk": "RUN#" + run["id"]}).get("Item")
        )
        self.assertEqual(
            self.table.get_item(Key={"pk": "H#owner", "sk": "SIMLOCKS"})["Item"]["devices"], {}
        )
        self.assertIn(
            "incident_ref",
            self.table.get_item(Key={"pk": receipt["pk"], "sk": receipt["sk"]})["Item"],
        )

    def test_on_change_cloud_run_reaches_real_ingress_and_unlocks(self):
        request, run = self.setup_run()
        self.assertEqual(start(self.table, "owner", request)["statusCode"], 200)
        result = self.tick(run)
        self.assertEqual((result["status"], result["accepted"]), ("completed", 1))
        self.assertEqual(read_budget(self.table, "owner", result["incident_ids"][0])["used"], 1)
        self.assertEqual(
            self.table.get_item(Key={"pk": "H#owner", "sk": "SIMLOCKS"})["Item"]["devices"], {}
        )

    def test_repeat_clear_and_quota_resume_retain_identity(self):
        _, run = self.setup_run(
            {**DEFAULT_PROFILE, "mode": "repeat", "duration_seconds": 120, "clear_at_end": True}
        )
        run = self.tick(run)
        incident = run["incident_ids"][0]
        self.table.update_item(
            Key=budget_key("owner", incident),
            UpdateExpression="SET ceiling = :one",
            ExpressionAttributeValues={":one": 1},
        )
        run = self.tick(run, run["created_at"] + 60)
        self.assertEqual((run["status"], run["accepted"]), ("paused", 1))
        pending = run["rows"][0]["pending"]["event"]["event_id"]
        self.assertEqual(extend(self.table, "owner", incident, {"limit": 2000})["statusCode"], 200)
        command(self.table, "owner", run["id"], {"action": "resume"})
        run = self.tick(get_run(self.table, "owner", run["id"]), run["created_at"] + 60)
        self.assertEqual(run["accepted"], 2)
        detail = json.loads(self.ingest.events.put_events.call_args.kwargs["Entries"][0]["Detail"])
        self.assertEqual(detail["event"]["event_id"], pending)
        run = self.tick(run, run["created_at"] + 120)
        self.assertEqual((run["status"], run["accepted"]), ("completed", 3))
        self.assertEqual(read_budget(self.table, "owner", incident)["used"], 3)
        self.assertEqual(
            json.loads(self.ingest.events.put_events.call_args.kwargs["Entries"][0]["Detail"])[
                "event_context"
            ]["state"]["alarm"],
            "clear",
        )

    def test_publication_failure_spends_once_and_keeps_pending_payload(self):
        _, run = self.setup_run()
        self.ingest.events.put_events.return_value = {"FailedEntryCount": 1}
        run = self.tick(run)
        self.assertEqual(run["accepted"], 0)
        self.ingest.events.put_events.return_value = {"FailedEntryCount": 0}
        command(self.table, "owner", run["id"], {"action": "resume"})
        run = self.tick(get_run(self.table, "owner", run["id"]))
        self.assertEqual(run["accepted"], 1)
        self.assertEqual(read_budget(self.table, "owner", run["incident_ids"][0])["used"], 1)

    def test_overlapping_runs_block_and_resolution_stops_remaining_generation(self):
        request, run = self.setup_run({**DEFAULT_PROFILE, "mode": "repeat"})
        with self.assertRaisesRegex(ValueError, "Kitchen smoke"):
            start(self.table, "owner", {**request, "request_id": str(uuid.uuid4())})
        run = self.tick(run)
        incident = run["incident_ids"][0]
        self.assertEqual(
            resolve(self.table, "owner", incident, {"confirm": True, "revision": 1})["statusCode"],
            200,
        )
        run = self.tick(run, run["created_at"] + 60)
        self.assertEqual((run["status"], run["accepted"]), ("stopped", 1))

    def test_single_uniqueness_and_named_scenario_conflicts(self):
        another = {**copy.deepcopy(self.item), "id": str(uuid.uuid4()), "name": "Duplicate"}
        with self.assertRaisesRegex(ValueError, "Smoke and Duplicate"):
            validate_library(
                {"revision": None, "items": [copy.deepcopy(self.item), another]}, self.catalog
            )

    def test_profiles_have_explicit_counts_and_bounds(self):
        self.assertEqual(expected_count(DEFAULT_PROFILE), 1)
        self.assertEqual(
            expected_count({**DEFAULT_PROFILE, "mode": "repeat", "clear_at_end": True}), 6
        )
        with self.assertRaises(ValueError):
            validate_profile({**DEFAULT_PROFILE, "interval_seconds": 1})


if __name__ == "__main__":
    unittest.main()
