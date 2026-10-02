"""Focused checks for independent live-state and historical-record reads."""

import json
import unittest
from unittest.mock import patch

from test_query_conditions import ROOT, load

INCIDENT = "00000000-0000-4000-8000-000000000001"


class IncidentViewTests(unittest.TestCase):
    def setUp(self):
        self.module = load("incident_views_api", ROOT / "functions/incident_api/handler.py")
        self.summary = {
            "incident_id": INCIDENT,
            "event_count": 1,
            "latest_assessment": "one",
        }
        self.assessment = {
            "assessment_id": "one",
            "evidence_revision": 1,
            "status": "assessed",
            "assessment": {"severity": "warning", "evidence_ids": []},
        }
        self.module.table.get_item.side_effect = self.get_item
        self.module.table.query.return_value = {"Items": []}
        self.state = {
            "severity": "warning",
            "active_devices": [],
            "last_reported_at": "2026-10-02T10:00:00Z",
        }
        self.snapshot = self.enterContext(
            patch.object(self.module, "snapshot", return_value=self.state)
        )
        self.enterContext(patch.object(self.module, "read_budget", return_value={"used": 1}))

    def get_item(self, Key, **kwargs):
        if Key["pk"] == "H#owner" and Key["sk"] == "INCIDENT#" + INCIDENT:
            return {"Item": dict(self.summary)}
        if Key["pk"] == "H#owner#I#" + INCIDENT and Key["sk"] == "ASSESSMENT#one":
            return {"Item": self.assessment}
        return {}

    def read(self, view="all", owner="owner", **params):
        result = self.module.handler(
            {
                "routeKey": "GET /incidents/{incident_id}/timeline",
                "requestContext": {"authorizer": {"jwt": {"claims": {"sub": owner}}}},
                "pathParameters": {"incident_id": INCIDENT},
                "queryStringParameters": {"view": view, **params},
            },
            None,
        )
        return result["statusCode"], json.loads(result["body"])

    def test_status_skips_audit_page_but_preserves_authoritative_state(self):
        status, body = self.read("status")
        self.assertEqual(status, 200)
        self.assertTrue(body["assessment_current"])
        self.assertEqual(body["last_reported_at"], self.state["last_reported_at"])
        self.assertEqual(body["items"], [])
        self.assertEqual(self.module.table.query.call_count, 1)  # Actions only.
        self.snapshot.assert_called_once()

    def test_records_skip_status_reconstruction_and_preserve_pagination(self):
        key = {"pk": "H#owner#I#" + INCIDENT, "sk": "AUDIT#one"}
        self.module.table.query.return_value = {
            "Items": [{**key, "kind": "decision_review", "data": {"verdict": "accepted"}}],
            "LastEvaluatedKey": key,
        }
        status, body = self.read("records")
        self.assertEqual(status, 200)
        self.assertNotIn("incident", body)
        self.assertNotIn("assessment_current", body)
        self.assertTrue(body["next_cursor"])
        self.snapshot.assert_not_called()
        self.module.read_budget.assert_not_called()
        self.read("records", cursor=body["next_cursor"])
        self.assertEqual(self.module.table.query.call_args.kwargs["ExclusiveStartKey"], key)

    def test_default_view_remains_backward_compatible(self):
        status, body = self.read()
        self.assertEqual(status, 200)
        self.assertIn("incident", body)
        self.assertIn("items", body)
        self.assertEqual(self.module.table.query.call_count, 2)

    def test_other_household_and_deleting_incident_cannot_be_read(self):
        self.assertEqual(self.read("records", owner="other")[0], 404)
        self.summary["deletion_started_at"] = 1
        self.assertEqual(self.read("status")[0], 410)
        self.module.table.query.assert_not_called()

    def test_mid_read_revision_change_never_advertises_current_assessment(self):
        def changed(*args):
            self.summary["event_count"] = 2
            return self.state

        self.snapshot.side_effect = changed
        status, body = self.read("status")
        self.assertEqual(status, 200)
        self.assertFalse(body["assessment_current"])
        self.assertTrue(body["refreshing"])
        self.assertNotIn("active_devices", body)

    def test_mid_read_deletion_discards_snapshot(self):
        def deleted(*args):
            self.summary["deletion_started_at"] = 1
            return self.state

        self.snapshot.side_effect = deleted
        self.assertEqual(self.read("status")[0], 410)

    def test_invalid_view_or_status_cursor_is_rejected(self):
        self.assertEqual(self.read("unsupported")[0], 400)
        self.assertEqual(self.read("status", cursor="invalid")[0], 400)
        self.module.table.query.assert_not_called()
