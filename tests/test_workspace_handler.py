"""Protect the live workspace endpoints while removing device execution."""

import json
import unittest
from unittest.mock import patch
import test_simulation_runs as fixture


class WorkspaceHandlerTests(unittest.TestCase):
    setUp = fixture.SimulationRunTests.setUp

    def module(self):
        module = fixture.load("workspace_management", "functions/action_executor/handler.py")
        module.table = self.table
        return module

    def request(self, route, body=None):
        return {
            "routeKey": route,
            "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "owner"}}}},
            "body": json.dumps(body or {}),
        }

    def test_settings_catalog_read_and_save_still_work(self):
        self.table.delete_item(Key={"pk": "H#owner", "sk": "CATALOG"})
        module = self.module()
        initial = module.handler(self.request("GET /household/catalog"), None)
        self.assertEqual(initial["statusCode"], 200)
        catalog = json.loads(initial["body"])
        self.assertEqual(len(catalog["devices"]), 24)
        catalog["devices"][0]["name"] = "My entrance contact"
        saved = module.handler(self.request("PUT /household/catalog", catalog), None)
        self.assertEqual(saved["statusCode"], 200)
        loaded = json.loads(module.handler(self.request("GET /household/catalog"), None)["body"])
        self.assertEqual(loaded["devices"][0]["name"], "My entrance contact")

    def test_workflow_publishes_briefing_without_device_operations(self):
        module = self.module()
        event = {"household_id": "owner", "incident_id": "old", "action_ids": ["legacy"]}
        with patch.object(module, "record_briefing") as record:
            self.assertEqual(module.handler(event, None), event)
        record.assert_called_once_with(self.table, "owner", "old")
        self.assertFalse(
            self.table.get_item(Key={"pk": "H#owner", "sk": "DEVICE#legacy"}).get("Item")
        )
