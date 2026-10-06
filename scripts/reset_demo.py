"""Explicit administrator reset of Aenea app data; never runs during deployment.

Dry-run is the default. Replay guards, login accounts and infrastructure survive.
"""

import argparse
import hashlib
import json
from pathlib import Path
import sys
import time
import uuid

import boto3

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "functions"))
from maple_house import furnished_catalog

WRITERS = (
    "ingest",
    "correlate",
    "invoke_reasoner",
    "action_executor",
    "mcp_tools",
    "simulation_worker",
    "cleanup",
)


def scan(table):
    rows, cursor = [], None
    while True:
        page = table.scan(ConsistentRead=True, **({"ExclusiveStartKey": cursor} if cursor else {}))
        rows.extend(page["Items"])
        cursor = page.get("LastEvaluatedKey")
        if not cursor:
            return rows


def household_owners(rows):
    owners = set()
    for row in rows:
        parts = row["pk"].split("#")
        if parts[0] == "H" and len(parts) in {2, 4}:
            uuid.UUID(parts[1])
            if len(parts) == 4:
                if parts[2] != "I":
                    raise ValueError("Unrecognized household partition")
                uuid.UUID(parts[3])
            owners.add(parts[1])
        elif row["pk"] not in {"SIMRUNS", "CLEANUP", "LIBGC"}:
            raise ValueError("Unrecognized partition: inspect it before resetting")
    return sorted(owners)


def evidence_inventory(s3, bucket, owners):
    count = 0
    for page in s3.get_paginator("list_object_versions").paginate(Bucket=bucket):
        objects = page.get("Versions", []) + page.get("DeleteMarkers", [])
        if any(item["Key"].split("/", 1)[0] not in owners for item in objects):
            raise ValueError("Unrecognized evidence owner: inspect before resetting")
        count += len(objects)
    return count


def reset(session, account, execute=False):
    actual = session.client("sts").get_caller_identity()["Account"]
    if actual != account:
        raise ValueError("AWS account does not match the explicitly confirmed account")
    table = session.resource("dynamodb").Table("aenea-state")
    dynamo, s3 = session.client("dynamodb"), session.client("s3")
    bucket = f"aenea-{account}-evidence"
    tags = dynamo.list_tags_of_resource(ResourceArn=table.table_arn)["Tags"]
    bucket_tags = s3.get_bucket_tagging(Bucket=bucket)["TagSet"]
    for resource_tags in (tags, bucket_tags):
        if {item["Key"]: item["Value"] for item in resource_tags}.get("Project") != "Aenea":
            raise ValueError("Refusing reset: resource is not tagged as Aenea")
    rows = scan(table)
    owners = household_owners(rows)
    evidence_versions = evidence_inventory(s3, bucket, owners)
    print(
        json.dumps(
            {
                "account": account,
                "table": table.name,
                "bucket": bucket,
                "households": len(owners),
                "records": len(rows),
                "evidence_versions": evidence_versions,
                "execute": execute,
            }
        ),
        flush=True,
    )
    if not execute:
        return
    lambdas, events, states = (
        session.client("lambda"),
        session.client("events"),
        session.client("stepfunctions"),
    )
    workflow = f"arn:aws:states:{session.region_name}:{account}:stateMachine:aenea-incident"
    paused, schedules = {}, {}
    try:
        for name in ("aenea-simulation", "aenea-cleanup"):
            try:
                schedules[name] = events.describe_rule(Name=name)["State"]
            except events.exceptions.ResourceNotFoundException:
                print(f"Schedule {name} is not deployed; nothing to pause.", flush=True)
                continue
            events.disable_rule(Name=name)
        for short in WRITERS:
            name = "aenea-" + short
            paused[name] = lambdas.get_function_concurrency(FunctionName=name).get(
                "ReservedConcurrentExecutions"
            )
            lambdas.put_function_concurrency(FunctionName=name, ReservedConcurrentExecutions=0)
        for page in states.get_paginator("list_executions").paginate(
            stateMachineArn=workflow, statusFilter="RUNNING"
        ):
            for execution in page["executions"]:
                states.stop_execution(
                    executionArn=execution["executionArn"], cause="Authorized clean handover reset"
                )
        print("Writers paused. Draining existing invocations for 180 seconds.", flush=True)
        for _ in range(18):
            time.sleep(10)
        rows = scan(table)
        if household_owners(rows) != owners:
            raise ValueError("Household inventory changed during pause; review before resetting")
        evidence_inventory(s3, bucket, owners)
        now = int(time.time())
        guards = {}
        for row in rows:
            if row["sk"].startswith(("INCIDENT#", "DELETED#")) and row["pk"].startswith("H#"):
                incident = row["sk"].split("#", 1)[1]
                key = (row["pk"], "DELETED#" + incident)
                guards[key] = {
                    "pk": key[0],
                    "sk": key[1],
                    "incident_id": incident,
                    "cleanup_status": "completed",
                    "reset_marker": True,
                    "requested_at": now,
                    "eligible_at": now,
                    "completed_at": now,
                }
            elif row["sk"].startswith("INGEST#"):
                incident = row.get("incident_id", "")
                guards[(row["pk"], row["sk"])] = {
                    "pk": row["pk"],
                    "sk": row["sk"],
                    "status": "deleted",
                    "incident_ref": hashlib.sha256(incident.encode()).hexdigest()
                    if incident
                    else row.get("incident_ref", ""),
                }
        with table.batch_writer() as writer:
            for guard in guards.values():
                writer.put_item(Item=guard)
        removed_objects = 0
        while True:
            page = s3.list_object_versions(Bucket=bucket, MaxKeys=1000)
            objects = [
                {"Key": item["Key"], "VersionId": item["VersionId"]}
                for item in page.get("Versions", []) + page.get("DeleteMarkers", [])
            ]
            if not objects:
                break
            if any(item["Key"].split("/", 1)[0] not in owners for item in objects):
                raise ValueError("Unrecognized evidence owner: reset stopped")
            result = s3.delete_objects(Bucket=bucket, Delete={"Objects": objects, "Quiet": True})
            if result.get("Errors"):
                raise RuntimeError("Evidence deletion incomplete")
            removed_objects += len(objects)
        with table.batch_writer() as writer:
            for row in rows:
                if (row["pk"], row["sk"]) not in guards and row["sk"] != "CATALOG":
                    writer.delete_item(Key={"pk": row["pk"], "sk": row["sk"]})
            for owner in owners:
                catalog = furnished_catalog()
                catalog["revision"] = str(uuid.uuid4())
                writer.put_item(Item={"pk": "H#" + owner, "sk": "CATALOG", **catalog})
        remaining = scan(table)
        if any(
            row["sk"] != "CATALOG" and (row["pk"], row["sk"]) not in guards for row in remaining
        ):
            raise RuntimeError("Unexpected records remain after reset")
        print(
            json.dumps(
                {
                    "reset": "complete",
                    "households": len(owners),
                    "evidence_versions_removed": removed_objects,
                    "house_catalogs": len(owners),
                    "system_replay_guards": len(guards),
                }
            ),
            flush=True,
        )
    finally:
        failures = []
        for name, concurrency in paused.items():
            try:
                if concurrency is None:
                    lambdas.delete_function_concurrency(FunctionName=name)
                else:
                    lambdas.put_function_concurrency(
                        FunctionName=name, ReservedConcurrentExecutions=concurrency
                    )
            except Exception as error:
                failures.append(f"{name}: {type(error).__name__}")
        for name, state in schedules.items():
            try:
                if state == "ENABLED":
                    events.enable_rule(Name=name)
            except Exception as error:
                failures.append(f"{name}: {type(error).__name__}")
        if failures:
            raise RuntimeError("Restore service settings: " + "; ".join(failures))
        print("Service concurrency and schedules restored.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--confirm-account", required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    reset(
        boto3.Session(profile_name=args.profile, region_name=args.region),
        args.confirm_account,
        args.execute,
    )
