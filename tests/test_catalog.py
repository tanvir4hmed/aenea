import copy
import json
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import Mock

from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "functions"))
from catalog import read_catalog, save_catalog, validate_catalog
from maple_house import HOUSE, ROOMS, furnished_catalog


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.location = dict(HOUSE)
        self.device = {
            "id": str(uuid.uuid4()),
            "name": "Kitchen smoke",
            "room": "Kitchen",
            "location_id": self.location["id"],
            "type": "smoke_detector",
            "enabled": True,
            "connection": "simulation",
        }
        self.body = {"revision": None, "locations": [self.location], "devices": [self.device]}

    def test_read_is_scoped_to_authenticated_owner(self):
        table = Mock()
        table.get_item.return_value = {}
        self.assertEqual(read_catalog(table, "owner-a"), furnished_catalog())
        table.get_item.assert_called_once_with(
            Key={"pk": "H#owner-a", "sk": "CATALOG"}, ConsistentRead=True
        )

    def test_write_uses_revision_and_separate_catalog_record(self):
        table = Mock()
        self.body["revision"] = str(uuid.uuid4())
        result = save_catalog(table, "owner-a", self.body)
        self.assertEqual(result["statusCode"], 200)
        args = table.put_item.call_args.kwargs
        self.assertEqual(args["Item"]["sk"], "CATALOG")
        self.assertEqual(args["Item"]["pk"], "H#owner-a")
        self.assertEqual(args["ExpressionAttributeValues"][":revision"], self.body["revision"])

    def test_conflicting_save_returns_409(self):
        table = Mock()
        table.put_item.side_effect = ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException"}}, "PutItem"
        )
        self.assertEqual(save_catalog(table, "owner-a", self.body)["statusCode"], 409)

    def test_orphan_device_rejected(self):
        self.body["locations"] = []
        with self.assertRaises(ValueError):
            validate_catalog(self.body)

    def test_duplicate_device_rejected(self):
        self.body["devices"].append(copy.deepcopy(self.device))
        with self.assertRaises(ValueError):
            validate_catalog(self.body)

    def test_real_connection_and_nonboolean_rejected(self):
        for key, value in [("connection", "ring"), ("enabled", "true")]:
            with self.subTest(key=key):
                body = copy.deepcopy(self.body)
                body["devices"][0][key] = value
                with self.assertRaises(ValueError):
                    validate_catalog(body)

    def test_deletion_removes_record_from_saved_catalog(self):
        table = Mock()
        self.body["devices"] = []
        result = save_catalog(table, "owner-a", self.body)
        self.assertEqual(json.loads(result["body"])["devices"], [])
        self.assertEqual(table.put_item.call_args.kwargs["Item"]["devices"], [])

    def test_limit_rejected(self):
        self.body["devices"] = [self.device] * 201
        with self.assertRaises(ValueError):
            validate_catalog(self.body)

    def test_room_limit_rejected(self):
        self.body["devices"] = [{**self.device, "id": str(uuid.uuid4())} for _ in range(31)]
        with self.assertRaisesRegex(ValueError, "30 devices"):
            validate_catalog(self.body)

    def test_defaults_are_valid_and_cover_every_room(self):
        body = furnished_catalog()
        validate_catalog(body)
        self.assertEqual({device["room"] for device in body["devices"]}, ROOMS)
        self.assertEqual(len(body["devices"]), 37)

    def test_arbitrary_room_and_location_are_rejected(self):
        self.body["devices"][0]["room"] = "Kitchen typo"
        with self.assertRaisesRegex(ValueError, "existing Maple House room"):
            validate_catalog(self.body)
        self.body["devices"][0]["room"] = "Kitchen"
        self.body["locations"][0]["name"] = "Another house"
        with self.assertRaisesRegex(ValueError, "fixed Maple House"):
            validate_catalog(self.body)

    def test_saved_empty_and_legacy_catalogs_are_not_overwritten(self):
        table = Mock()
        for body in [
            {"revision": str(uuid.uuid4()), "locations": [HOUSE], "devices": []},
            {"revision": str(uuid.uuid4()), "locations": [{"id": "legacy"}], "devices": []},
        ]:
            table.get_item.return_value = {"Item": body}
            self.assertEqual(read_catalog(table, "owner-a"), body)
        table.put_item.assert_not_called()
