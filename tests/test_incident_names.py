import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock
from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'functions'))
from incident_names import rename_incident, validate_name


class IncidentNamesTests(unittest.TestCase):
    def test_name_validation(self):
        self.assertEqual(validate_name('  Drawing room · Water leak  '), 'Drawing room · Water leak')
        for value in ('', ' ', 'x' * 121, 'line\nbreak', None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_name(value)

    def test_rename_is_owner_scoped_and_cannot_create_or_restore_an_incident(self):
        table = Mock()
        result = rename_incident(table, 'owner', 'incident', {'name': 'Kitchen smoke'})
        self.assertEqual(result['statusCode'], 200)
        args = table.update_item.call_args.kwargs
        self.assertEqual(args['Key'], {'pk': 'H#owner', 'sk': 'INCIDENT#incident'})
        self.assertIn('attribute_exists(pk)', args['ConditionExpression'])
        self.assertIn('attribute_not_exists(deletion_started_at)', args['ConditionExpression'])
        self.assertEqual(json.loads(result['body'])['name'], 'Kitchen smoke')

    def test_missing_or_deleting_record_returns_conflict(self):
        table = Mock()
        table.update_item.side_effect = ClientError({'Error': {'Code': 'ConditionalCheckFailedException'}}, 'UpdateItem')
        self.assertEqual(rename_incident(table, 'owner', 'incident', {'name': 'Kitchen'})['statusCode'], 409)
