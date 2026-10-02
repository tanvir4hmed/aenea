"""Retired device controls cannot execute through older API/workflow callers."""

import unittest
from unittest.mock import Mock, patch

from test_revisions import load


class RetiredActionsTests(unittest.TestCase):
    def test_execution_is_disabled_without_reading_or_writing_device_state(self):
        with (
            patch.dict("os.environ", {"STATE_TABLE": "offline", "DEVICE_ACTIONS_ENABLED": "false"}),
            patch("boto3.resource"),
        ):
            module = load("retired_coordination", "functions/coordination.py")
            module.table = Mock()
            result = module.execute("household", "incident", "old-action", confirmed=True)
            self.assertEqual(result["status"], "blocked")
            self.assertFalse(result["execution_performed"])
            self.assertEqual(module.table.mock_calls, [])

    def test_old_assessments_cannot_generate_new_action_proposals(self):
        with (
            patch.dict("os.environ", {"STATE_TABLE": "offline", "DEVICE_ACTIONS_ENABLED": "false"}),
            patch("boto3.resource"),
            patch("boto3.client"),
        ):
            module = load("retired_policy", "functions/policy/handler.py")
            module.get = Mock()
            result = module.handler({"incident_id": "old", "action_ids": ["old-action"]}, None)
            self.assertEqual(result["action_ids"], [])
            module.get.assert_not_called()
