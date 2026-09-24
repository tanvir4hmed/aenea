"""Regression coverage for DynamoDB key conditions used by incident reads."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions"))


class FakeCondition:
    def __init__(self, value):
        self.value = value

    def __and__(self, other):
        return FakeCondition(("and", self.value, other.value))


class FakeKey:
    def __init__(self, field):
        self.field = field

    def eq(self, value):
        return FakeCondition(("eq", self.field, value))

    def begins_with(self, value):
        if value == "":
            raise AssertionError("empty DynamoDB begins_with")
        return FakeCondition(("begins_with", self.field, value))


def load(name, path, modules=None):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    resource = Mock()
    resource.Table.return_value = Mock()
    with patch.dict(sys.modules, modules or {}), patch("boto3.resource", return_value=resource):
        spec.loader.exec_module(module)
    return module


class QueryConditionTests(unittest.TestCase):
    def test_incident_api_uses_partition_only_for_full_timeline(self):
        module = load("isolated_incident_api", ROOT / "functions/incident_api/handler.py")
        with patch.object(module, "Key", FakeKey):
            self.assertEqual(module.key_condition("H#owner#I#incident", "").value,
                             ("eq", "pk", "H#owner#I#incident"))

    def test_household_tools_uses_partition_only_for_full_timeline(self):
        storage = type("Storage", (), {"audit": Mock(), "audit_item": Mock(), "attrs": lambda value: value,
            "execute": Mock(), "get": Mock(), "profile": Mock(), "table": Mock()})()
        storage.table.name = "offline"
        module = load("isolated_household_tools", ROOT / "functions/household_tools.py", {"coordination": storage})
        with patch.object(module, "Key", FakeKey):
            self.assertEqual(module.key_condition("H#owner#I#incident", "").value,
                             ("eq", "pk", "H#owner#I#incident"))
            self.assertEqual(module.key_condition("H#owner#I#incident", "EVENT#").value[0], "and")
