"""AgentCore MCP server. Every tool derives tenancy from a verified Cognito JWT."""
import json
import os
from typing import Literal

import boto3
from botocore.config import Config
import jwt
from mcp.server.fastmcp import FastMCP, Context

mcp = FastMCP("Aenea", host="0.0.0.0", port=8000, stateless_http=True, json_response=True,
    instructions="Coordinate simulated household incidents. Never infer occupancy from motion. Confirm valve actions only after an explicit user approval of that exact action. Never claim emergency dispatch.")
issuer = os.environ["COGNITO_ISSUER"]
jwks = jwt.PyJWKClient(issuer + "/.well-known/jwks.json")
lambda_client = boto3.client("lambda", config=Config(connect_timeout=3, read_timeout=15,
    retries={"total_max_attempts": 1}))


def call(ctx, name, arguments):
    request = ctx.request_context.request
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise ValueError("Bearer access token required")
    token = header[7:]
    claims = jwt.decode(token, jwks.get_signing_key_from_jwt(token).key, algorithms=["RS256"],
        issuer=issuer, options={"require": ["exp", "iat", "sub", "client_id", "token_use"],
                                "verify_aud": False})
    if claims["client_id"] != os.environ["COGNITO_CLIENT_ID"] or claims["token_use"] != "access":
        raise ValueError("Invalid access token")
    if "aenea/read" not in set(claims.get("scope", "").split()):
        raise ValueError("Read scope required")
    payload = {"principal": {"sub": claims["sub"], "scope": claims.get("scope", "")},
               "tool": name, "arguments": arguments}
    result = lambda_client.invoke(FunctionName=os.environ["TOOLS_FUNCTION_ARN"],
                                   Payload=json.dumps(payload).encode())
    body = json.loads(result["Payload"].read())
    if result.get("FunctionError") or body.get("statusCode") != 200:
        raise ValueError("Tool rejected or unavailable; verify arguments and permissions")
    return json.loads(body["body"])


@mcp.tool()
def get_incident_status(incident_id: str, ctx: Context) -> dict:
    """Read an incident and its latest assessment in the signed-in household."""
    return call(ctx, "get_incident_status", {"incident_id": incident_id})


@mcp.tool()
def get_incident_timeline(incident_id: str, ctx: Context, cursor: str | None = None) -> dict:
    """Read one page of evidence and audit records; use next_cursor for more."""
    return call(ctx, "get_incident_timeline", {"incident_id": incident_id, "cursor": cursor})


@mcp.tool()
def get_household_status(incident_id: str, ctx: Context, cursor: str | None = None) -> dict:
    """Read this incident's self-reported people; older incidents never imply safety now."""
    return call(ctx, "get_household_status", {"incident_id": incident_id, "cursor": cursor})


@mcp.tool()
def report_person_status(incident_id: str, person: str,
                         status: Literal["safe", "needs_help", "not_home", "unknown"], request_id: str, ctx: Context) -> dict:
    """Record an explicit simulated check-in. Generate a UUID request_id once; reuse on retry."""
    return call(ctx, "report_person_status", {"incident_id": incident_id, "person": person, "status": status, "request_id": request_id})


@mcp.tool()
def acknowledge_incident(incident_id: str, ctx: Context) -> dict:
    """Acknowledge receipt, without resolving the incident or marking anyone safe."""
    return call(ctx, "acknowledge_incident", {"incident_id": incident_id})


@mcp.tool()
def request_safe_action(incident_id: str, action_id: str, ctx: Context) -> dict:
    """Request an existing assessed action. Deterministic policy is rechecked."""
    return call(ctx, "request_safe_action", {"incident_id": incident_id, "action_id": action_id})


@mcp.tool()
def confirm_action(incident_id: str, action_id: str, assessment_id: str, confirm: bool, ctx: Context) -> dict:
    """Only after explicit user approval of this action, confirm a pending virtual valve proposal."""
    return call(ctx, "confirm_action", {"incident_id": incident_id, "action_id": action_id, "assessment_id": assessment_id, "confirm": confirm})


@mcp.tool()
def get_action_status(incident_id: str, action_id: str, ctx: Context) -> dict:
    """Read the recorded outcome, including failure, expiration or pending confirmation."""
    return call(ctx, "get_action_status", {"incident_id": incident_id, "action_id": action_id})


@mcp.tool()
def get_responder_summary(incident_id: str, ctx: Context) -> dict:
    """Read a synthetic handoff; does not contact responders. Observe the partial flag."""
    return call(ctx, "get_responder_summary", {"incident_id": incident_id})


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
