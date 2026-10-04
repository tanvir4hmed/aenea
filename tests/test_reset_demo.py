"""Offline scope checks for the explicit administrator reset utility."""

from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from reset_demo import evidence_inventory, household_owners, reset

OWNER = "00000000-0000-4000-8000-000000000001"
INCIDENT = "00000000-0000-4000-8000-000000000002"


class ResetScopeTests(unittest.TestCase):
    def test_account_mismatch_stops_before_any_resource_access(self):
        session = Mock()
        session.client.return_value.get_caller_identity.return_value = {"Account": "unexpected"}
        with self.assertRaises(ValueError):
            reset(session, "confirmed", execute=True)
        session.client.assert_called_once_with("sts")
        session.resource.assert_not_called()

    def test_households_are_deduplicated_and_system_queues_are_recognized(self):
        rows = [
            {"pk": key}
            for key in (f"H#{OWNER}", f"H#{OWNER}#I#{INCIDENT}", "SIMRUNS", "CLEANUP", "LIBGC")
        ]
        self.assertEqual(household_owners(rows), [OWNER])

    def test_unknown_partitions_stop_reset(self):
        for key in ("unrelated-app", "H#invalid", f"H#{OWNER}#OTHER#{INCIDENT}"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                household_owners([{"pk": key}])

    def test_evidence_inventory_includes_versions_and_delete_markers(self):
        s3 = Mock()
        s3.get_paginator.return_value.paginate.return_value = [
            {"Versions": [{"Key": OWNER + "/evidence.json"}]},
            {"DeleteMarkers": [{"Key": OWNER + "/evidence.json"}]},
        ]
        self.assertEqual(evidence_inventory(s3, "aenea-test-evidence", [OWNER]), 2)
        s3.delete_objects.assert_not_called()

    def test_unknown_evidence_owner_stops_before_deletion(self):
        s3 = Mock()
        s3.get_paginator.return_value.paginate.return_value = [
            {"Versions": [{"Key": "unrelated/file"}]}
        ]
        with self.assertRaises(ValueError):
            evidence_inventory(s3, "aenea-test-evidence", [OWNER])
        s3.delete_objects.assert_not_called()
