"""Scheduled, retryable cleanup of explicitly requested incident data only."""

import os
import time
import uuid
import hashlib

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from common import table_name
from lifecycle import deleted, marker_key
from simulation_runs import finish
from incidentbridge import idempotency_key, normalize_event

table = boto3.resource("dynamodb").Table(table_name())
s3 = boto3.client("s3")


def budget(context):
    if context.get_remaining_time_in_millis() < 15000:
        raise TimeoutError("Continue on the next scheduled run")


def purge(job, context):
    owner, incident = job["owner"], str(uuid.UUID(job["incident_id"]))
    job_key = {"pk": "CLEANUP", "sk": f"JOB#{owner}#{incident}"}
    if job["sk"] != job_key["sk"] or not owner or "/" in owner:
        raise ValueError("Invalid cleanup target")
    marker = deleted(table, owner, incident)
    if not marker or marker["eligible_at"] > int(time.time()):
        return
    if marker["cleanup_status"] == "completed":
        table.delete_item(Key=job_key)
        return
    table.update_item(
        Key=marker_key(owner, incident),
        UpdateExpression="SET cleanup_status = :state",
        ExpressionAttributeValues={":state": "purging"},
    )
    prefix = f"{owner}/{incident}/"
    # Repeatedly remove the first page: retries also remove noncurrent versions and delete markers.
    while True:
        budget(context)
        page = s3.list_object_versions(
            Bucket=os.environ["EVIDENCE_BUCKET"], Prefix=prefix, MaxKeys=1000
        )
        objects = [
            {"Key": item["Key"], "VersionId": item["VersionId"]}
            for item in page.get("Versions", []) + page.get("DeleteMarkers", [])
        ]
        if not objects:
            break
        if any(not item["Key"].startswith(prefix) for item in objects):
            raise ValueError("Unexpected S3 cleanup target")
        result = s3.delete_objects(
            Bucket=os.environ["EVIDENCE_BUCKET"], Delete={"Objects": objects, "Quiet": True}
        )
        if result.get("Errors"):
            raise RuntimeError("Evidence deletion incomplete")
    while True:
        budget(context)
        records = table.query(
            KeyConditionExpression=Key("pk").eq(f"H#{owner}#I#{incident}"),
            Limit=100,
            ConsistentRead=True,
        )["Items"]
        if not records:
            break
        with table.batch_writer() as writer:
            for record in records:
                writer.delete_item(Key={"pk": record["pk"], "sk": record["sk"]})
    # Ingress receipts live at household level. Persist the cursor for large households.
    cursor = job.get("ingest_cursor")
    while True:
        budget(context)
        query = {
            "KeyConditionExpression": Key("pk").eq(f"H#{owner}") & Key("sk").begins_with("INGEST#"),
            "Limit": 100,
            "ConsistentRead": True,
        }
        if cursor:
            query["ExclusiveStartKey"] = cursor
        page = table.query(**query)
        with table.batch_writer() as writer:
            for record in page["Items"]:
                if record.get("incident_id") == incident:
                    # Keep only the irreversible retry identity, never location/evidence.
                    writer.put_item(
                        Item={
                            "pk": record["pk"],
                            "sk": record["sk"],
                            "status": "deleted",
                            "incident_ref": hashlib.sha256(incident.encode()).hexdigest(),
                        }
                    )
        cursor = page.get("LastEvaluatedKey")
        if not cursor:
            break
        table.update_item(
            Key=job_key,
            UpdateExpression="SET ingest_cursor = :cursor",
            ExpressionAttributeValues={":cursor": cursor},
        )
    # Registered and legacy outputs: preserve a newer incident's state.
    query = {
        "KeyConditionExpression": Key("pk").eq(f"H#{owner}") & Key("sk").begins_with("DEVICE#"),
        "Limit": 100,
        "ConsistentRead": True,
    }
    while True:
        budget(context)
        page = table.query(**query)
        for output in page["Items"]:
            if output.get("incident_id") != incident:
                continue
            try:
                table.delete_item(
                    Key={"pk": output["pk"], "sk": output["sk"]},
                    ConditionExpression="incident_id = :incident",
                    ExpressionAttributeValues={":incident": incident},
                )
            except ClientError as exc:
                if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
                    raise
        if not page.get("LastEvaluatedKey"):
            break
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    table.delete_item(Key={"pk": f"H#{owner}", "sk": "INCIDENT#" + incident})
    table.delete_item(Key={"pk": f"H#{owner}", "sk": "SIMBUDGET#" + incident})
    query = {
        "KeyConditionExpression": Key("pk").eq(f"H#{owner}") & Key("sk").begins_with("RUN#"),
        "ConsistentRead": True,
        "Limit": 50,
    }
    while True:
        budget(context)
        page = table.query(**query)
        for run in page["Items"]:
            belongs = incident in run.get("incident_ids", [])
            # An ingress timeout can reserve an incident before the run receives its ID.
            for row in run.get("rows", []) if not belongs else []:
                if not row.get("pending"):
                    continue
                identity = idempotency_key(normalize_event(row["pending"]["event"], "webhook"))
                receipt = table.get_item(
                    Key={"pk": f"H#{owner}", "sk": "INGEST#" + identity}, ConsistentRead=True
                ).get("Item", {})
                if (
                    receipt.get("incident_id") == incident
                    or receipt.get("incident_ref") == hashlib.sha256(incident.encode()).hexdigest()
                ):
                    belongs = True
                    break
            if not belongs:
                continue
            if run["status"] in {"running", "paused"}:
                finish(table, owner, run, "stopped", "Incident deletion")
            table.delete_item(Key={"pk": run["pk"], "sk": run["sk"]})
        if not page.get("LastEvaluatedKey"):
            break
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    table.update_item(
        Key=marker_key(owner, incident),
        UpdateExpression="SET cleanup_status = :state, completed_at = :now",
        ExpressionAttributeValues={":state": "completed", ":now": int(time.time())},
    )
    table.delete_item(Key=job_key)


def sweep(context):
    cursor = None
    while context.get_remaining_time_in_millis() > 20000:
        query = {
            "KeyConditionExpression": Key("pk").eq("CLEANUP") & Key("sk").begins_with("JOB#"),
            "Limit": 25,
            "ConsistentRead": True,
        }
        if cursor:
            query["ExclusiveStartKey"] = cursor
        page = table.query(**query)
        for job in page["Items"]:
            if job["eligible_at"] > int(time.time()):
                continue
            try:
                purge(job, context)
            except Exception:
                # Job persists for scheduled retry. Do not log incident contents or claim completion.
                table.update_item(
                    Key=marker_key(job["owner"], job["incident_id"]),
                    UpdateExpression="SET cleanup_status = :state",
                    ExpressionAttributeValues={":state": "retrying"},
                )
            if context.get_remaining_time_in_millis() < 20000:
                return
        cursor = page.get("LastEvaluatedKey")
        if not cursor:
            break
    query = {"KeyConditionExpression": Key("pk").eq("LIBGC"), "Limit": 25, "ConsistentRead": True}
    while context.get_remaining_time_in_millis() > 20000:
        page = table.query(**query)
        for job in page["Items"]:
            if job["eligible_at"] > int(time.time()):
                continue
            current = table.get_item(
                Key={"pk": f"H#{job['owner']}", "sk": "SIMULATIONS"}, ConsistentRead=True
            ).get("Item", {})
            if current.get("revision") != job["generation"]:
                while True:
                    budget(context)
                    rows = table.query(
                        KeyConditionExpression=Key("pk").eq(
                            f"H#{job['owner']}#SIMLIB#{job['generation']}"
                        ),
                        Limit=25,
                        ConsistentRead=True,
                    )["Items"]
                    if not rows:
                        break
                    with table.batch_writer() as writer:
                        for row in rows:
                            writer.delete_item(Key={"pk": row["pk"], "sk": row["sk"]})
            table.delete_item(Key={"pk": job["pk"], "sk": job["sk"]})
        if not page.get("LastEvaluatedKey"):
            break
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def handler(event, context):
    # Account quotas may prohibit reserved concurrency. Serialize sweepers with
    # a lease longer than the Lambda's 170-second hard timeout.
    key = {"pk": "CLEANUP", "sk": "LOCK"}
    token = str(uuid.uuid4())
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
        sweep(context)
    finally:
        # Never remove a replacement lease if this invocation lost ownership.
        try:
            table.delete_item(
                Key=key,
                ConditionExpression="lease_token = :token",
                ExpressionAttributeValues={":token": token},
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise
