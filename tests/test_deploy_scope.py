"""Deployment isolation contracts. No subprocesses, credentials or cloud writes."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from deploy_scope import FUNCTIONS, select_scope


class DeploymentScopeTests(unittest.TestCase):
    def test_house_definition_rebuilds_web_and_functions(self):
        scope = select_scope(["functions/house_layout.json"])
        self.assertTrue(scope.web)
        self.assertEqual(scope.packages, FUNCTIONS)
        self.assertFalse(scope.reasoner or scope.mcp or scope.layers)

    def test_web_only_does_not_deploy_backend(self):
        scope = select_scope(["apps/web/src/App.jsx"])
        self.assertTrue(scope.web)
        self.assertFalse(
            scope.layers or scope.packages or scope.reasoner or scope.mcp or scope.workflow
        )

    def test_each_function_is_independently_deployable(self):
        for name in FUNCTIONS:
            with self.subTest(name=name):
                scope = select_scope([f"functions/{name}/handler.py"])
                self.assertEqual(scope.functions, {name})
                self.assertEqual(scope.packages, {name})
                self.assertFalse(scope.web or scope.layers or scope.reasoner or scope.mcp)

    def test_function_dependency_change_rebuilds_all_functions_only(self):
        scope = select_scope(["functions/requirements.txt"])
        self.assertEqual(scope.packages, FUNCTIONS)
        self.assertFalse(scope.layers or scope.web or scope.reasoner or scope.mcp)

    def test_shared_assessment_rebuilds_both_consumers(self):
        scope = select_scope(["shared/assessment.py"])
        self.assertEqual(scope.packages, FUNCTIONS)
        self.assertTrue(scope.reasoner)
        self.assertFalse(scope.web or scope.mcp or scope.layers)

    def test_mcp_and_reasoner_are_isolated(self):
        for path, component in (
            ("services/mcp/main.py", "mcp"),
            ("infra/mcp/main.tf", "mcp"),
            ("agent/reasoner/main.py", "reasoner"),
            ("infra/reasoner/main.tf", "reasoner"),
        ):
            with self.subTest(path=path):
                scope = select_scope([path])
                self.assertEqual(scope.mcp, component == "mcp")
                self.assertEqual(scope.reasoner, component == "reasoner")
                self.assertFalse(scope.web or scope.layers or scope.packages)

    def test_infrastructure_dependencies(self):
        for layer, expected in (
            ("data", {"data", "app"}),
            ("platform", {"platform", "app"}),
            ("app", {"app"}),
            ("tls", {"platform", "app"}),
        ):
            with self.subTest(layer=layer):
                scope = select_scope([f"infra/{layer}/main.tf"])
                self.assertEqual(scope.layers, expected)
                self.assertEqual(scope.packages, FUNCTIONS)
                self.assertFalse(scope.web)
                self.assertEqual(scope.mcp, layer == "platform")

    def test_workflow_only_does_not_rebuild_functions(self):
        scope = select_scope(["workflows/incident_state_machine/definition.asl.json"])
        self.assertTrue(scope.workflow)
        self.assertFalse(scope.web or scope.layers or scope.packages or scope.reasoner or scope.mcp)

    def test_docs_and_tests_do_not_deploy(self):
        scope = select_scope(["README.md", "tests/test_safety.py", "docs/user-guide.md"])
        self.assertFalse(
            scope.web
            or scope.layers
            or scope.packages
            or scope.workflow
            or scope.reasoner
            or scope.mcp
        )

    def test_first_push_and_all_dispatch_include_every_component(self):
        for selected in ("", "all"):
            scope = select_scope([], selected)
            self.assertTrue(scope.web and scope.reasoner and scope.mcp)
            self.assertEqual(scope.layers, {"data", "platform", "app"})
            self.assertEqual(scope.packages, FUNCTIONS)

    def test_dispatch_scopes(self):
        for component in ("web", "backend", "app", "infrastructure", "domain", "reasoner", "mcp"):
            with self.subTest(component=component):
                scope = select_scope([], component)
                self.assertEqual(scope.web, component == "web")
                self.assertEqual(scope.workflow, component == "backend")
                self.assertEqual(scope.reasoner, component in {"reasoner", "infrastructure"})
                self.assertEqual(scope.mcp, component in {"mcp", "infrastructure"})

    def test_deployer_only_change_refreshes_infrastructure(self):
        scope = select_scope(["scripts/deploy_scope.py"])
        self.assertEqual(scope.layers, {"data", "platform", "app"})
        self.assertEqual(scope.functions, FUNCTIONS)
        self.assertTrue(scope.mcp and scope.reasoner)
        self.assertFalse(scope.web)

    def test_mixed_deployer_and_web_preserves_component_selection(self):
        scope = select_scope(["scripts/deploy.py", "apps/web/package-lock.json"])
        self.assertTrue(scope.web)
        self.assertFalse(scope.layers or scope.packages or scope.mcp or scope.reasoner)


if __name__ == "__main__":
    unittest.main()
