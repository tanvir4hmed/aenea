"""Offline regressions; prepared for the deferred verification gate, not run here."""
import base64
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "functions"))
from cursors import decode_cursor


def token(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode()


class CursorTests(unittest.TestCase):
    def test_valid(self):
        key = {"pk": "H#a", "sk": "INCIDENT#1"}
        self.assertEqual(decode_cursor(token(key), "H#a", "INCIDENT#"), key)

    def test_rejects_foreign_partition_prefix_and_shape(self):
        for value in [{"pk": "H#b", "sk": "INCIDENT#1"}, {"pk": "H#a", "sk": "PERSON#1"},
                      {"pk": "H#a", "sk": 1}, [], None, {"pk": "H#a"}]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                decode_cursor(token(value), "H#a", "INCIDENT#")

    def test_rejects_malformed_and_oversized(self):
        for value in ("%bad", "a" * 4097, "", 2):
            with self.subTest(value=value), self.assertRaises(ValueError):
                decode_cursor(value, "H#a")
