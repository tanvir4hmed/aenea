"""Workflow definition guards optional compatibility fields before reading them."""
import json
from pathlib import Path
import unittest


class WorkflowDefinitionTests(unittest.TestCase):
    def test_deletion_choice_allows_legacy_correlate_output(self):
        path = Path(__file__).resolve().parents[1] / "workflows/incident_state_machine/definition.asl.json"
        choice = json.loads(path.read_text())["States"]["CheckDeletion"]["Choices"][0]
        self.assertEqual(choice["Next"], "AssessmentUnavailable")
        self.assertEqual(choice["And"][0], {"Variable": "$.deleted", "IsPresent": True})
        self.assertEqual(choice["And"][1], {"Variable": "$.deleted", "BooleanEquals": True})
