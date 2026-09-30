"""Static release contracts: scheduler packaging, route scopes and bootstrap grant."""

import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from deploy_scope import FUNCTIONS, select_scope


class SimulationWiringTests(unittest.TestCase):
    def test_scheduler_is_packaged_and_source_change_selects_it(self):
        app = json.loads((ROOT / "infra/app/main.tf.json").read_text())
        self.assertEqual(set(app["locals"]["functions"]), set(FUNCTIONS))
        scope = select_scope(["functions/simulation_worker/handler.py"])
        self.assertEqual(scope.functions, {"simulation_worker"})
        self.assertFalse(scope.web or scope.reasoner or scope.mcp)
        self.assertIn(
            "INGEST_FUNCTION",
            app["resource"]["aws_lambda_function"]["function"]["environment"]["variables"],
        )

    def test_mutating_routes_need_write_scope(self):
        routes = json.loads((ROOT / "infra/app/main.tf.json").read_text())["locals"]["routes"]
        for name in [
            "POST /household/runs",
            "POST /household/runs/{run_id}",
            "POST /incidents/{incident_id}/notes",
            "POST /incidents/{incident_id}/message",
            "POST /incidents/{incident_id}/simulation-limit",
        ]:
            self.assertEqual(routes[name]["scope"], "aenea/write")

    def test_default_bus_scheduler_rule_is_in_bootstrap(self):
        policy = json.loads(
            (ROOT / "infra/bootstrap/deployment-workflow-policy.json.tftpl").read_text()
        )
        resources = [
            value
            for statement in policy["Statement"]
            if "events:PutRule" in statement.get("Action", [])
            for value in statement["Resource"]
        ]
        self.assertIn("arn:aws:events:${region}:${account_id}:rule/aenea-simulation", resources)
