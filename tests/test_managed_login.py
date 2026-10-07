"""Resource-bound MCP authentication requires Cognito managed login, not Classic UI."""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ManagedLoginConfigurationTests(unittest.TestCase):
    def test_resource_binding_has_supported_login_tier_and_client_branding(self):
        config = json.loads((ROOT / "infra/platform/main.tf.json").read_text())
        resources = config["resource"]
        self.assertIn(
            resources["aws_cognito_user_pool"]["household"]["user_pool_tier"],
            {"ESSENTIALS", "PLUS"},
        )
        domain = resources["aws_cognito_user_pool_domain"]["web"]
        self.assertEqual(domain["managed_login_version"], 2)
        branding = resources["aws_cognito_managed_login_branding"]["web"]
        self.assertEqual(branding["client_id"], "${aws_cognito_user_pool_client.web.id}")
        self.assertTrue(branding["use_cognito_provided_values"])
        self.assertIn("aws_cognito_managed_login_branding.web", domain["depends_on"])

    def test_branding_permissions_are_scoped_and_do_not_remove_resource_audience_checks(self):
        template = (ROOT / "infra/bootstrap/deployment-edge-policy.json.tftpl").read_text()
        policy = json.loads(
            template.replace("${region}", "us-east-1").replace("${account_id}", "123456789012")
        )
        branding = next(
            statement
            for statement in policy["Statement"]
            if statement.get("Sid") == "ManagedLoginBranding"
        )
        self.assertEqual(
            branding["Resource"], "arn:aws:cognito-idp:us-east-1:123456789012:userpool/*"
        )
        self.assertEqual(len(branding["Action"]), 4)
        mcp = (ROOT / "infra/mcp/main.tf").read_text()
        self.assertIn("allowed_audience = [local.resource_url]", mcp)
