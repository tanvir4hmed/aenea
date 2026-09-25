import copy
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import Mock
from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'functions'))
from simulation_library import read_library, save_library, validate_library


class SimulationLibraryTests(unittest.TestCase):
    def setUp(self):
        self.device = {'id': str(uuid.uuid4()), 'type': 'smoke_detector'}
        self.catalog = {'devices': [self.device]}
        self.body = {'revision': None, 'items': [{'id': str(uuid.uuid4()), 'name': 'Kitchen smoke', 'type': 'single', 'signals': [{'deviceId': self.device['id'], 'kind': 'smoke', 'observation': ''}]}]}

    def test_duplicate_device_and_incompatible_signal_rejected(self):
        body = copy.deepcopy(self.body)
        body['items'][0]['type'] = 'scenario'
        body['items'][0]['signals'] *= 2
        with self.assertRaisesRegex(ValueError, 'only once'):
            validate_library(body, self.catalog)
        self.body['items'][0]['signals'][0]['kind'] = 'water_leak'
        with self.assertRaisesRegex(ValueError, 'incompatible'):
            validate_library(self.body, self.catalog)

    def test_single_requires_one_device(self):
        self.body['items'][0]['signals'] *= 2
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            validate_library(self.body, self.catalog)

    def test_save_is_revision_checked_and_household_scoped(self):
        table = Mock()
        table.get_item.return_value = {'Item': self.catalog}
        result = save_library(table, 'owner', self.body)
        self.assertEqual(result['statusCode'], 200)
        args = table.put_item.call_args.kwargs
        self.assertEqual(args['Item']['pk'], 'H#owner')
        self.assertEqual(args['Item']['sk'], 'SIMULATIONS')
        self.assertEqual(args['ConditionExpression'], 'attribute_not_exists(pk)')
        table.update_item.assert_not_called()

    def test_concurrent_edit_conflicts(self):
        table = Mock()
        table.get_item.return_value = {'Item': self.catalog}
        table.put_item.side_effect = ClientError({'Error': {'Code': 'ConditionalCheckFailedException'}}, 'PutItem')
        self.assertEqual(save_library(table, 'owner', self.body)['statusCode'], 409)

    def test_read_does_not_access_other_households(self):
        table = Mock()
        table.get_item.return_value = {}
        self.assertEqual(read_library(table, 'owner'), {'revision': None, 'items': []})
        table.get_item.assert_called_once_with(Key={'pk': 'H#owner', 'sk': 'SIMULATIONS'}, ConsistentRead=True)
