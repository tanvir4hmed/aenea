"""Current assessment output cannot carry device commands."""

import unittest
import sys
from pathlib import Path
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "shared"))
from assessment import IncidentAssessment


class AssessmentContractTests(unittest.TestCase):
    def test_device_commands_are_rejected_but_ordinary_assessment_remains_valid(self):
        body = {
            "incident_type": "smoke",
            "severity": "warning",
            "confidence": 0.5,
            "summary": "Smoke reported",
            "evidence_ids": ["one"],
            "uncertainties": [],
        }
        result = IncidentAssessment.model_validate(body).check_evidence([{"event_id": "one"}])
        self.assertEqual(result.actions, [])
        with self.assertRaises(ValidationError):
            IncidentAssessment.model_validate({**body, "actions": [{"action": "lights_on"}]})
