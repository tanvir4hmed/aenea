"""Tenant-scoped persistence and audit helpers."""

import json
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

from common import table_name

table = boto3.resource("dynamodb").Table(table_name())
serializer = TypeSerializer()


def native(value):
    return json.loads(json.dumps(value, default=float), parse_float=Decimal)


def attrs(value):
    return {k: serializer.serialize(v) for k, v in native(value).items()}


def partition(owner, incident):
    return f"H#{owner}#I#{incident}"


def get(owner, incident, key):
    return table.get_item(
        Key={"pk": partition(owner, incident), "sk": key}, ConsistentRead=True
    ).get("Item")


def audit_item(owner, incident, kind, identity, payload):
    return {
        "pk": partition(owner, incident),
        "sk": f"AUDIT#{kind}#{identity}",
        "kind": kind,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "simulated": True,
        "data": native(payload),
    }


def audit(owner, incident, kind, identity, payload):
    item = audit_item(owner, incident, kind, identity, payload)
    try:
        table.put_item(Item=item, ConditionExpression="attribute_not_exists(pk)")
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
