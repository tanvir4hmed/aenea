"""Minute-tick simulator generation. Uses exactly the public ingress processing path."""

import json
import os
import time
import uuid
import logging
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from common import table_name
from simulation_runs import get_run, work, save

table = boto3.resource("dynamodb").Table(table_name())
client = boto3.client("lambda")


def deliver(owner, payload):
    result = client.invoke(
        FunctionName=os.environ["INGEST_FUNCTION"],
        InvocationType="RequestResponse",
        Payload=json.dumps(
            {
                "body": json.dumps(payload),
                "requestContext": {"authorizer": {"jwt": {"claims": {"sub": owner}}}},
            }
        ).encode(),
    )
    if result.get("FunctionError"):
        raise RuntimeError("Ingress failed; same event identity will retry")
    return json.loads(result["Payload"].read())


def handler(event, context):
    token = str(uuid.uuid4())
    key = {"pk": "SIMRUNS", "sk": "LOCK"}
    now = int(time.time())
    try:
        table.update_item(
            Key=key,
            UpdateExpression="SET lease_token = :token, lease_until = :until",
            ConditionExpression="attribute_not_exists(lease_until) OR lease_until < :now",
            ExpressionAttributeValues={":token": token, ":until": now + 240, ":now": now},
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return {"status": "already_running"}
        raise
    try:
        query = {
            "KeyConditionExpression": Key("pk").eq("SIMRUNS"),
            "ConsistentRead": True,
            "Limit": 25,
        }
        lease = table.get_item(Key=key, ConsistentRead=True).get("Item", {})
        if lease.get("cursor"):
            query["ExclusiveStartKey"] = lease["cursor"]
        while context.get_remaining_time_in_millis() > 25000:
            page = table.query(**query)
            for job in page["Items"]:
                if context.get_remaining_time_in_millis() < 25000:
                    return {"status": "continuing_next_tick"}
                if not job.get("owner"):
                    continue
                run = get_run(table, job["owner"], job["id"])
                if run:
                    try:
                        work(
                            table, job["owner"], run, deliver, context.get_remaining_time_in_millis
                        )
                    except Exception as exc:
                        logging.getLogger(__name__).warning(
                            "simulation_delivery_failed type=%s", type(exc).__name__
                        )
                        current = get_run(table, job["owner"], job["id"])
                        if current and current["status"] == "running":
                            previous = current["revision"]
                            current.update(
                                status="paused",
                                message="Delivery interrupted. Pending events retain their identities; review and resume. No clear or successful delivery is assumed.",
                            )
                            try:
                                save(table, current, previous)
                            except ClientError as conflict:
                                if (
                                    conflict.response["Error"]["Code"]
                                    != "ConditionalCheckFailedException"
                                ):
                                    raise
                table.update_item(
                    Key=key,
                    UpdateExpression="SET #cursor = :cursor",
                    ConditionExpression="lease_token = :token",
                    ExpressionAttributeNames={"#cursor": "cursor"},
                    ExpressionAttributeValues={
                        ":cursor": {"pk": job["pk"], "sk": job["sk"]},
                        ":token": token,
                    },
                )
            if not page.get("LastEvaluatedKey"):
                table.update_item(
                    Key=key,
                    UpdateExpression="REMOVE #cursor",
                    ConditionExpression="lease_token = :token",
                    ExpressionAttributeNames={"#cursor": "cursor"},
                    ExpressionAttributeValues={":token": token},
                )
                break
            query["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    finally:
        table.update_item(
            Key=key,
            UpdateExpression="REMOVE lease_token, lease_until",
            ConditionExpression="lease_token = :token",
            ExpressionAttributeValues={":token": token},
        )
