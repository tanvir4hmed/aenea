"""Natural language never grants tool authority or device approval."""

import io
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path[:0] = [str(Path(__file__).resolve().parents[1] / path) for path in ("functions", "shared")]
from assessment import ConversationIntent
from conversation import answer, interpret, message


class CommandBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.dispatch = Mock(return_value={"incident": {"name": "Synthetic"}})
        modules = patch.dict(
            sys.modules, {"household_tools": SimpleNamespace(dispatch=self.dispatch)}
        )
        modules.start()
        self.addCleanup(modules.stop)

    def test_unsupported_intent_never_dispatches(self):
        with patch("conversation.interpret", return_value=ConversationIntent(intent="unsupported")):
            result = message(
                "owner", "incident", {"text": "close the valve"}, {"aenea/read", "aenea/write"}
            )
        self.assertEqual(result["statusCode"], 200)
        self.dispatch.assert_not_called()

    def test_actual_scopes_not_invented(self):
        with patch("conversation.interpret") as model, self.assertRaises(PermissionError):
            message("owner", "incident", {"text": "status"}, {"aenea/write"})
        model.assert_not_called()
        self.dispatch.assert_not_called()

    def test_status_uses_authenticated_owner_and_bounded_tool(self):
        scopes = {"aenea/read", "aenea/write"}
        with patch("conversation.interpret", return_value=ConversationIntent(intent="status")):
            self.assertEqual(
                message("owner", "incident", {"text": "status"}, scopes)["statusCode"], 200
            )
        self.dispatch.assert_called_once_with(
            "owner", scopes, "get_incident_status", {"incident_id": "incident"}
        )

    def test_outage_does_not_fabricate_reply(self):
        with patch("conversation.interpret", side_effect=TimeoutError):
            self.assertEqual(
                message("owner", "incident", {"text": "status"}, {"aenea/read", "aenea/write"})[
                    "statusCode"
                ],
                503,
            )
        self.dispatch.assert_not_called()

    def test_question_topic_is_returned_with_compatible_tool_data(self):
        with patch(
            "conversation.interpret",
            return_value=ConversationIntent(intent="status", topic="occupancy"),
        ):
            result = message(
                "owner", "incident", {"text": "Is anyone home?"}, {"aenea/read", "aenea/write"}
            )
        payload = json.loads(result["body"])
        self.assertEqual(payload["tool"], "get_incident_status")
        self.assertEqual(payload["topic"], "occupancy")
        self.assertEqual(payload["data"], self.dispatch.return_value)
        self.assertIn("cannot confirm whether anyone is home", payload["answer"])

    def test_auto_sent_voice_cannot_acknowledge(self):
        with patch("conversation.interpret", return_value=ConversationIntent(intent="acknowledge")):
            result = message(
                "owner",
                "incident",
                {"text": "I have seen this", "read_only": True},
                {"aenea/read", "aenea/write"},
            )
        self.assertIn("button", json.loads(result["body"])["answer"])
        self.dispatch.assert_not_called()

    def test_explicit_acknowledgment_still_uses_bounded_tool(self):
        with patch("conversation.interpret", return_value=ConversationIntent(intent="acknowledge")):
            message(
                "owner", "incident", {"text": "I have seen this"}, {"aenea/read", "aenea/write"}
            )
        self.assertEqual(self.dispatch.call_args.args[2], "acknowledge_incident")

    def test_question_classification_uses_one_model_invocation(self):
        client = Mock()
        client.invoke_agent_runtime.return_value = {
            "response": io.BytesIO(
                json.dumps({"intent": {"intent": "status", "topic": "devices"}}).encode()
            )
        }
        with (
            patch("conversation.boto3.client", return_value=client),
            patch.dict("os.environ", {"REASONER_ARN": "test-runtime"}),
        ):
            result = interpret("Which devices reported?")
        self.assertEqual(result.topic, "devices")
        client.invoke_agent_runtime.assert_called_once()

    def test_old_runtime_response_defaults_to_general_topic(self):
        self.assertEqual(ConversationIntent.model_validate({"intent": "status"}).topic, "general")


class IncidentAnswerTests(unittest.TestCase):
    def setUp(self):
        self.identifier = "b36e6c19-5260-4392-a90c-787d2b1a2f0e"
        self.data = {
            "incident": {"event_count": 5, "note_revision": 1},
            "severity": "urgent",
            "active_device_count": 2,
            "reporting_device_count": 2,
            "active_devices": [
                {
                    "device_id": self.identifier,
                    "name": self.identifier,
                    "display_name": "Hall camera",
                    "kind": "motion",
                    "alarm": "active",
                },
                {
                    "device_id": "smoke",
                    "name": "Kitchen detector",
                    "kind": "smoke",
                    "alarm": "active",
                },
            ],
            "assessment_current": True,
            "assessment": {
                "status": "assessed",
                "evidence_revision": 5,
                "note_revision": 1,
                "assessment": {"uncertainties": ["Cause unverified", "Occupancy unverified"]},
            },
        }

    def test_occupancy_is_not_inferred_from_motion_or_notes(self):
        result = answer("occupancy", self.data)
        self.assertIn("cannot confirm whether anyone is home", result)
        self.assertIn("Motion reports do not verify occupancy", result)
        self.assertIn("notes are unverified", result)
        self.assertNotIn(self.identifier, result)

    def test_devices_answer_is_specific_named_and_short(self):
        result = answer("devices", self.data)
        self.assertIn("Hall camera (motion)", result)
        self.assertIn("Kitchen detector (smoke)", result)
        self.assertNotIn(self.identifier, result)
        self.assertNotIn("evidence revision", result)
        self.assertNotEqual(result, answer("occupancy", self.data))
        self.assertLess(len(result), 200)

    def test_cleared_reporters_are_included_but_not_presented_as_active(self):
        self.data["reporting_devices"] = [
            {"name": "Kitchen detector", "kind": "smoke", "alarm": "clear"}
        ]
        self.data.update(active_devices=[], reporting_device_count=1, all_clear=True)
        self.assertIn("smoke, clear", answer("devices", self.data))
        self.assertIn("does not confirm safety", answer("general", self.data))

    def test_stale_or_rejected_assessment_is_never_presented_as_current(self):
        self.data["assessment_current"] = False
        self.assertIn("out of date", answer("assessment", self.data))
        self.assertIn("out of date", answer("uncertainty", self.data))
        self.data["assessment_current"] = True
        self.data["incident"]["decision_review"] = "rejected"
        self.assertIn("rejected", answer("assessment", self.data))
        self.assertIn("rejected", answer("uncertainty", self.data))

    def test_changes_count_new_evidence_and_notes(self):
        self.data["incident"].update(event_count=7, note_revision=2)
        self.data["assessment_current"] = False
        result = answer("changes", self.data)
        self.assertIn("2 new sensor reports and 1 new note", result)
        self.assertIn("updated assessment is needed", result)

    def test_uncertainty_does_not_leak_identifiers(self):
        self.data["assessment"]["assessment"]["uncertainties"] = [
            f"Cause unknown for {self.identifier}"
        ]
        self.assertNotIn(self.identifier, answer("uncertainty", self.data))

    def test_many_devices_are_bounded_and_unknown_states_remain_explicit(self):
        self.data["reporting_devices"] = [
            {"name": f"Detector {index}", "kind": "smoke", "alarm": "unknown"}
            for index in range(12)
        ]
        self.data["reporting_device_count"] = 20
        result = answer("devices", self.data)
        self.assertIn("17 more devices", result)
        self.assertIn("alarm states are unknown", result)
        self.assertNotIn("Detector 3", result)

    def test_empty_state_does_not_claim_sensor_clearance(self):
        result = answer("general", {"all_clear": True, "reporting_device_count": 0})
        self.assertNotIn("states are clear", result)
        self.assertIn("not available yet", result)
