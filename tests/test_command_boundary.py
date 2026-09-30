"""Natural language never grants tool authority or device approval."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path[:0] = [str(Path(__file__).resolve().parents[1] / path) for path in ("functions", "shared")]
from conversation import message


class CommandBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.dispatch = Mock(return_value={"incident": {"name": "Synthetic"}})
        modules = patch.dict(
            sys.modules, {"household_tools": SimpleNamespace(dispatch=self.dispatch)}
        )
        modules.start()
        self.addCleanup(modules.stop)

    def test_unsupported_intent_never_dispatches(self):
        with patch("conversation.interpret", return_value="unsupported"):
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
        with patch("conversation.interpret", return_value="status"):
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
