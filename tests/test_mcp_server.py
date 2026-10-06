"""Exercise the actual FastMCP HTTP app; only signing-key lookup and Lambda are mocked."""

import importlib.util
import io
import json
import os
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from starlette.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/mcp"))


class McpServerTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(
            os.environ,
            {
                "COGNITO_ISSUER": "https://issuer.example",
                "COGNITO_CLIENT_ID": "client",
                "MCP_RESOURCE_URL": "https://api.example/mcp",
                "TOOLS_FUNCTION_ARN": "offline",
            },
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        with patch("boto3.client"):
            spec = importlib.util.spec_from_file_location(
                "sdk_server", ROOT / "services/mcp/main.py"
            )
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.module.jwks = Mock()
        self.module.jwks.get_signing_key_from_jwt.return_value.key = key.public_key()
        claims = {
            "iss": "https://issuer.example",
            "sub": "owner",
            "client_id": "client",
            "aud": "https://api.example/mcp",
            "token_use": "access",
            "exp": int(time.time()) + 600,
            "iat": int(time.time()),
            "scope": "aenea/read",
        }
        self.headers = {
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-11-25",
            "Authorization": "Bearer " + jwt.encode(claims, key, algorithm="RS256"),
        }
        self.client = TestClient(
            self.module.mcp.streamable_http_app(), base_url="http://localhost:8000"
        )
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def post(self, method, params, identity=1):
        return self.client.post(
            "/mcp",
            headers=self.headers,
            json={
                "jsonrpc": "2.0",
                "method": method,
                "params": params,
                **({"id": identity} if identity is not None else {}),
            },
        )

    def test_initialize_notification_and_tools_list(self):
        result = self.post(
            "initialize",
            {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "offline-test", "version": "1"},
            },
        )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["result"]["protocolVersion"], "2025-11-25")
        self.assertEqual(self.post("notifications/initialized", {}, None).status_code, 202)
        names = {tool["name"] for tool in self.post("tools/list", {}).json()["result"]["tools"]}
        self.assertIn("get_incident_status", names)
        self.assertNotIn("report_person_status", names)
        self.assertEqual(len(names), 5)
        self.assertTrue(
            names.isdisjoint({"request_safe_action", "confirm_action", "get_action_status"})
        )

    def test_tool_forwards_verified_identity_not_client_owner(self):
        self.module.lambda_client.invoke.return_value = {
            "Payload": io.BytesIO(
                json.dumps(
                    {"statusCode": 200, "body": json.dumps({"incident": {"name": "Kitchen smoke"}})}
                ).encode()
            )
        }
        result = self.post(
            "tools/call", {"name": "get_incident_status", "arguments": {"incident_id": "test"}}
        )
        self.assertFalse(result.json()["result"].get("isError", False))
        sent = json.loads(self.module.lambda_client.invoke.call_args.kwargs["Payload"])
        self.assertEqual(sent["principal"]["sub"], "owner")
        self.assertEqual(sent["arguments"], {"incident_id": "test"})

    def test_read_only_token_tool_write_error_never_reaches_lambda(self):
        result = self.post(
            "tools/call", {"name": "acknowledge_incident", "arguments": {"incident_id": "test"}}
        )
        self.assertTrue(result.json()["result"]["isError"])
        self.module.lambda_client.invoke.assert_not_called()
