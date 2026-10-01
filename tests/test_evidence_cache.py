import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "functions"))
from evidence_cache import EvidenceCache


class EvidenceCacheTests(unittest.TestCase):
    def test_revision_and_owner_isolation(self):
        cache = EvidenceCache()
        cache.put("alice", "incident", 1, {"active_devices": ["smoke"]})
        self.assertIsNone(cache.get("bob", "incident", 1))
        self.assertIsNone(cache.get("alice", "incident", 2))
        result = cache.get("alice", "incident", 1)
        result["active_devices"].clear()
        self.assertEqual(cache.get("alice", "incident", 1)["active_devices"], ["smoke"])

    def test_expiry_capacity_and_legacy_records(self):
        now = [0]
        cache = EvidenceCache(capacity=1, ttl=60, clock=lambda: now[0])
        cache.put("owner", "first", 1, {})
        cache.put("owner", "second", 1, {})
        self.assertIsNone(cache.get("owner", "first", 1))
        now[0] = 60
        self.assertIsNone(cache.get("owner", "second", 1))
        cache.put("owner", "legacy", None, {})
        self.assertIsNone(cache.get("owner", "legacy", None))
