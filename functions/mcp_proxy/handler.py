"""Fixed-upstream Streamable HTTP proxy and public OAuth resource metadata."""
import base64
import json
import os
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from common import response


def handler(event, context):
    if event["routeKey"].startswith("GET /.well-known/"):
        return response(200, {"resource": os.environ["MCP_RESOURCE_URL"],
            "authorization_servers": [os.environ["COGNITO_ISSUER"]],
            "scopes_supported": ["aenea/read", "aenea/write"],
            "bearer_methods_supported": ["header"]})
    headers = {k.lower(): v for k, v in event.get("headers", {}).items()}
    if headers.get("origin") and headers["origin"] not in json.loads(os.environ["MCP_ALLOWED_ORIGINS"]):
        return response(403, {"error": "Origin not allowed"})
    if event["routeKey"] == "GET /mcp":
        return {"statusCode": 405, "headers": {"allow": "POST"}, "body": "Stateless MCP supports POST only"}
    token = headers.get("authorization", "")
    if not token.startswith("Bearer "):
        return response(401, {"error": "Bearer access token required"})
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        try:
            raw = base64.b64decode(raw, validate=True).decode()
        except (ValueError, UnicodeError):
            return response(400, {"error": "Invalid request encoding"})
    if len(raw.encode()) > 64000:
        return response(413, {"error": "MCP request too large"})
    try:
        runtime = boto3.client("ssm").get_parameter(Name=os.environ["MCP_PARAMETER"])["Parameter"]["Value"]
        url = f"https://bedrock-agentcore.{os.environ['AWS_REGION']}.amazonaws.com/runtimes/{quote(runtime, safe='')}/invocations?qualifier=DEFAULT"
        forwarded = {"Authorization": token, "Content-Type": "application/json",
                     "Accept": "application/json, text/event-stream"}
        for key in ("mcp-protocol-version", "mcp-session-id"):
            if key in headers:
                forwarded[key] = headers[key]
        request = Request(url, data=raw.encode(), headers=forwarded, method="POST")
        with urlopen(request, timeout=20) as result:
            body = result.read(200001)
            if len(body) > 200000:
                return response(502, {"error": "MCP response exceeded the demo size limit. Read state before retrying a write."})
            outgoing = {"content-type": result.headers.get("content-type", "application/json"), "cache-control": "no-store"}
            if result.headers.get("mcp-session-id"):
                outgoing["mcp-session-id"] = result.headers["mcp-session-id"]
            return {"statusCode": result.status,
                    "headers": outgoing,
                    "body": body.decode()}
    except HTTPError as exc:
        return {"statusCode": exc.code, "headers": {"content-type": "application/json", "cache-control": "no-store"},
                "body": json.dumps({"error": "MCP upstream rejected the request", "status": exc.code})}
    except (URLError, TimeoutError, BotoCoreError, ClientError):
        return response(503, {"error": "MCP runtime unavailable. For a write, read its status before retrying."})
