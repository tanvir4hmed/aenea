"""Atomic simulator-only allowance. A receipt spends once, even after publish retry."""

import boto3
from botocore.exceptions import ClientError
from incident_engine import attrs
from simulation_profiles import DEFAULT_LIMIT, MAX_LIMIT
from common import response


def key(owner, incident):
    return {"pk": f"H#{owner}", "sk": "SIMBUDGET#" + incident}


def read_budget(table, owner, incident):
    item = table.get_item(Key=key(owner, incident), ConsistentRead=True).get("Item", {})
    return {
        "used": int(item.get("used", 0)),
        "limit": int(item.get("ceiling", DEFAULT_LIMIT)),
        "maximum": MAX_LIMIT,
    }


def charge(table, owner, incident, receipt_key):
    receipt = table.get_item(Key=receipt_key, ConsistentRead=True).get("Item", {})
    if receipt.get("quota_reserved"):
        return True
    try:
        table.put_item(
            Item={**key(owner, incident), "used": 0, "ceiling": DEFAULT_LIMIT},
            ConditionExpression="attribute_not_exists(pk)",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
    try:
        boto3.client("dynamodb").transact_write_items(
            TransactItems=[
                {
                    "ConditionCheck": {
                        "TableName": table.name,
                        "Key": attrs({"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}),
                        "ConditionExpression": "attribute_not_exists(resolved_at) AND attribute_not_exists(deletion_started_at)",
                    }
                },
                {
                    "Update": {
                        "TableName": table.name,
                        "Key": attrs(key(owner, incident)),
                        "UpdateExpression": "ADD used :one",
                        "ConditionExpression": "used < ceiling",
                        "ExpressionAttributeValues": attrs({":one": 1}),
                    }
                },
                {
                    "Update": {
                        "TableName": table.name,
                        "Key": attrs(receipt_key),
                        "UpdateExpression": "SET quota_reserved = :yes",
                        "ConditionExpression": "attribute_exists(pk) AND attribute_not_exists(quota_reserved) AND #s <> :deleted",
                        "ExpressionAttributeNames": {"#s": "status"},
                        "ExpressionAttributeValues": attrs({":yes": True, ":deleted": "deleted"}),
                    }
                },
            ]
        )
        return True
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        return bool(
            table.get_item(Key=receipt_key, ConsistentRead=True)
            .get("Item", {})
            .get("quota_reserved")
        )


def extend(table, owner, incident, body):
    value = body.get("limit") if isinstance(body, dict) else None
    if type(value) is not int or not DEFAULT_LIMIT <= value <= MAX_LIMIT:
        raise ValueError(f"Limit must be {DEFAULT_LIMIT}–{MAX_LIMIT}")
    try:
        boto3.client("dynamodb").transact_write_items(
            TransactItems=[
                {
                    "ConditionCheck": {
                        "TableName": table.name,
                        "Key": attrs({"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}),
                        "ConditionExpression": "attribute_exists(pk) AND attribute_not_exists(resolved_at) AND attribute_not_exists(deletion_started_at)",
                    }
                },
                {
                    "Update": {
                        "TableName": table.name,
                        "Key": attrs(key(owner, incident)),
                        "UpdateExpression": "SET ceiling = :limit",
                        "ConditionExpression": "used <= :limit AND ceiling < :limit",
                        "ExpressionAttributeValues": attrs({":limit": value}),
                    }
                },
            ]
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        return response(
            409, {"error": "Choose a higher limit for an open incident; refresh current usage"}
        )
    return response(200, read_budget(table, owner, incident))
