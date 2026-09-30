"""Atomic incident assignment and lifecycle. Models propose; storage guards decide."""

import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.config import Config
from botocore.exceptions import ClientError
from incidentbridge import IncidentEvent

from common import response
from incident_names import validate_name

serializer = TypeSerializer()


def attrs(value: dict[str, Any]) -> dict[str, Any]:
    return {key: serializer.serialize(item) for key, item in value.items()}


def family(kind: str) -> str:
    if kind in {"smoke", "carbon_monoxide", "heat", "gas_leak"}:
        return "fire_gas"
    if kind in {
        "motion",
        "doorbell",
        "package",
        "vehicle",
        "person_detected",
        "contact_open",
        "forced_entry",
        "glass_break",
        "security_alarm",
        "tamper",
        "lock_tamper",
    }:
        return "security"
    return kind


def routing_key(context: dict[str, Any], kind: str) -> str:
    return f"ROUTE#{context['location']['id']}#{family(kind)}"


def propose_name(
    event: IncidentEvent, context: dict[str, Any], candidate: dict[str, Any] | None = None
) -> tuple[str, dict[str, Any]]:
    """A bounded routing-agent request; outage never invents a model result."""
    decision = "join" if candidate else "create"
    fallback = (
        str(candidate["name"])
        if candidate
        else f"{context['location']['name']} · {event.kind.replace('_', ' ')} alerts"[:120]
    )
    try:
        runtime = boto3.client(
            "bedrock-agentcore",
            config=Config(connect_timeout=2, read_timeout=10, retries={"total_max_attempts": 1}),
        )
        result = runtime.invoke_agent_runtime(
            agentRuntimeArn=os.environ["REASONER_ARN"],
            runtimeSessionId=str(uuid.uuid4()),
            contentType="application/json",
            payload=json.dumps(
                {
                    "task": "route",
                    "event": event.model_dump(mode="json"),
                    "context": context,
                    "allowed_decision": decision,
                    "candidate": {
                        key: candidate[key]
                        for key in ("incident_id", "name", "location_id", "hazard_family")
                    }
                    if candidate
                    else None,
                }
            ).encode(),
        )
        body = json.loads(result["response"].read())
        from assessment import RoutingDecision

        proposal = RoutingDecision.model_validate(body["routing"])
        if proposal.decision != decision:
            raise ValueError("Invalid routing decision")
        return validate_name(proposal.name), {
            "mode": "agent",
            "decision": decision,
            "reason": proposal.reason,
            "model_id": body["model_id"],
        }
    except Exception:
        return fallback, {
            "mode": "deterministic_fallback",
            "decision": decision,
            "reason": "Routing model unavailable; isolated by registered location and hazard family.",
        }


def reserve(
    table: Any,
    owner: str,
    event: IncidentEvent,
    context: dict[str, Any],
    receipt: dict[str, Any],
    requested: str | None = None,
) -> dict[str, Any]:
    """Receipt, route ownership and initial incident commit together; retry races reread."""
    client = boto3.client("dynamodb")
    route_key = {"pk": f"H#{owner}", "sk": routing_key(context, event.kind)}
    proposals: dict[str, tuple[str, dict[str, Any]]] = {}
    source_key = f"{event.source.source_id}:{event.kind}"
    for _ in range(5):
        existing = table.get_item(
            Key={"pk": receipt["pk"], "sk": receipt["sk"]}, ConsistentRead=True
        ).get("Item")
        if existing:
            return dict(existing)
        route = table.get_item(Key=route_key, ConsistentRead=True).get("Item", {})
        incident = requested or route.get("incident_id")
        summary = (
            table.get_item(
                Key={"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}, ConsistentRead=True
            ).get("Item", {})
            if incident
            else {}
        )
        usable = (
            summary and not summary.get("resolved_at") and not summary.get("deletion_started_at")
        )
        if requested and summary and not usable:
            raise ValueError("Incident is closed. Use automatic assignment for new alerts.")
        if requested and summary.get("location_id") not in {None, context["location"]["id"]}:
            raise ValueError("Cannot add a device from another location to this incident")
        if requested and summary.get("hazard_family") not in {None, family(event.kind)}:
            raise ValueError("Unrelated hazard needs automatic assignment")
        closed_at = (
            route.get("closed_at")
            or summary.get("resolved_at")
            or summary.get("deletion_started_at")
        )
        if not requested and closed_at:
            occurred = event.occurred_at.timestamp()
            if occurred <= float(closed_at):
                raise ValueError(
                    "Delayed pre-resolution alert cannot open new activity; use a fresh event"
                )
        if not usable:
            incident = requested or str(uuid.uuid4())
            if "create" not in proposals:
                proposals["create"] = propose_name(event, context)
            name, routing = proposals["create"]
            summary = {
                "pk": f"H#{owner}",
                "sk": "INCIDENT#" + incident,
                "incident_id": incident,
                "name": name,
                "lifecycle": "open",
                "status": "collecting_evidence",
                "event_count": 0,
                "location_id": context["location"]["id"],
                "hazard_family": family(event.kind),
                "route_key": route_key["sk"],
                "created_at": context["received_at"],
                "routing": routing,
                "generation": str(uuid.uuid4()),
            }
        else:
            if source_key not in route.get("sources", []):
                if incident not in proposals:
                    proposals[incident] = propose_name(event, context, summary)
                _, routing = proposals[incident]
            else:
                routing = {
                    "mode": "validated_route_reuse",
                    "decision": "join",
                    "reason": "This source already belongs to the open location/hazard route; unchanged assignment reused.",
                }
        saved = {
            **receipt,
            "incident_id": incident,
            "incident_name": summary["name"],
            "routing": routing,
        }
        operations: list[dict[str, Any]] = [
            {
                "Put": {
                    "TableName": table.name,
                    "Item": attrs(saved),
                    "ConditionExpression": "attribute_not_exists(pk)",
                }
            }
        ]
        if usable:
            operations.append(
                {
                    "ConditionCheck": {
                        "TableName": table.name,
                        "Key": attrs({"pk": summary["pk"], "sk": summary["sk"]}),
                        "ConditionExpression": "attribute_exists(pk) AND attribute_not_exists(resolved_at) AND attribute_not_exists(deletion_started_at)",
                    }
                }
            )
        else:
            operations.append(
                {
                    "Put": {
                        "TableName": table.name,
                        "Item": attrs(summary),
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                }
            )
        # A manual legacy assignment never steals a different active route.
        if not requested or not route.get("incident_id") or route.get("incident_id") == incident:
            condition = "generation = :generation" if route else "attribute_not_exists(pk)"
            put: dict[str, Any] = {
                "TableName": table.name,
                "Item": attrs(
                    {
                        **route_key,
                        "incident_id": incident,
                        "generation": str(uuid.uuid4()),
                        # Bounded routing cache only; eviction never drops an event/state.
                        "sources": (
                            list(dict.fromkeys(route.get("sources", []) if usable else []))
                            + [source_key]
                        )[-256:],
                        **({"closed_at": route["closed_at"]} if "closed_at" in route else {}),
                    }
                ),
                "ConditionExpression": condition,
            }
            if route:
                put["ExpressionAttributeValues"] = attrs({":generation": route["generation"]})
            operations.append({"Put": put})
        try:
            client.transact_write_items(TransactItems=operations)
            return saved
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "TransactionCanceledException":
                raise
    raise RuntimeError("Incident assignment contention; retry the same event")


def resolve(table: Any, owner: str, incident: str, body: Any) -> Any:
    if (
        not isinstance(body, dict)
        or not {"confirm", "revision"} <= set(body) <= {"confirm", "revision", "note_revision"}
        or body["confirm"] is not True
        or type(body["revision"]) is not int
        or type(body.get("note_revision", 0)) is not int
    ):
        return response(
            400, {"error": "Explicit confirmation and current evidence revision required"}
        )
    key = {"pk": f"H#{owner}", "sk": "INCIDENT#" + incident}
    summary = table.get_item(Key=key, ConsistentRead=True).get("Item", {})
    if summary.get("resolved_at"):
        return response(200, {"incident_id": incident, "lifecycle": "resolved"})
    now = datetime.now(timezone.utc).timestamp()
    stamp = Decimal(str(now))
    operations = [
        {
            "Update": {
                "TableName": table.name,
                "Key": attrs(key),
                "UpdateExpression": "SET lifecycle = :closed, resolved_at = :now, resolved_by = :owner, #s = :closed",
                "ConditionExpression": "attribute_exists(pk) AND attribute_not_exists(deletion_started_at) AND attribute_not_exists(resolved_at) AND event_count = :revision AND (note_revision = :notes OR (attribute_not_exists(note_revision) AND :notes = :zero))",
                "ExpressionAttributeNames": {"#s": "status"},
                "ExpressionAttributeValues": attrs(
                    {
                        ":closed": "resolved",
                        ":now": stamp,
                        ":owner": owner,
                        ":revision": body["revision"],
                        ":notes": body.get("note_revision", 0),
                        ":zero": 0,
                    }
                ),
            }
        },
        {
            "Put": {
                "TableName": table.name,
                "Item": attrs(
                    {
                        "pk": f"H#{owner}#I#{incident}",
                        "sk": "AUDIT#resolved",
                        "kind": "resolved",
                        "recorded_at": datetime.now(timezone.utc).isoformat(),
                        "data": {"actor": owner, "revision": body["revision"]},
                    }
                ),
            }
        },
    ]
    if summary.get("route_key"):
        route_key = {"pk": f"H#{owner}", "sk": summary["route_key"]}
        route = table.get_item(Key=route_key, ConsistentRead=True).get("Item", {})
        if route.get("incident_id") == incident:
            operations.append(
                {
                    "Put": {
                        "TableName": table.name,
                        "Item": attrs(
                            {**route_key, "generation": str(uuid.uuid4()), "closed_at": stamp}
                        ),
                        "ConditionExpression": "incident_id = :id",
                        "ExpressionAttributeValues": attrs({":id": incident}),
                    }
                }
            )
    try:
        boto3.client("dynamodb").transact_write_items(TransactItems=operations)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        return response(
            409,
            {
                "error": "Incident changed. Refresh and confirm its current evidence before resolving."
            },
        )
    return response(200, {"incident_id": incident, "lifecycle": "resolved"})
