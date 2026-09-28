import importlib.util
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions"))
spec = importlib.util.spec_from_file_location(
    "tested_proxy", ROOT / "functions/mcp_proxy/handler.py"
)
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)


class ProxyTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(
            os.environ,
            {
                "MCP_RESOURCE_URL": "https://api.example/mcp",
                "MCP_ALLOWED_ORIGINS": '["https://aenea.example"]',
                "COGNITO_ISSUER": "https://issuer.example",
                "MCP_PARAMETER": "/offline",
                "AWS_REGION": "us-east-1",
            },
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        self.request = {
            "routeKey": "POST /mcp",
            "headers": {
                "authorization": "Bearer test",
                "content-type": "application/json",
                "accept": "application/json, text/event-stream",
                "mcp-protocol-version": "2025-11-25",
                "origin": "https://aenea.example",
            },
            "body": json.dumps({"jsonrpc": "2.0", "id": "1", "method": "initialize"}),
        }

    def test_protocol_origin_media_and_batch_rejected_without_upstream(self):
        for header, value, status in (
            ("origin", "https://evil.example", 403),
            ("mcp-protocol-version", "unknown", 400),
            ("content-type", "text/plain", 415),
            ("accept", "application/json", 406),
        ):
            with self.subTest(header=header), patch.object(proxy, "urlopen") as upstream:
                original = self.request["headers"][header]
                self.request["headers"][header] = value
                self.assertEqual(proxy.handler(self.request, None)["statusCode"], status)
                upstream.assert_not_called()
                self.request["headers"][header] = original
        self.request["body"] = "[]"
        self.assertEqual(proxy.handler(self.request, None)["statusCode"], 400)

    def test_get_is_explicitly_unsupported(self):
        self.request["routeKey"] = "GET /mcp"
        self.assertEqual(proxy.handler(self.request, None)["statusCode"], 405)

    def test_missing_token_returns_resource_challenge(self):
        self.request["headers"].pop("authorization")
        result = proxy.handler(self.request, None)
        self.assertEqual(result["statusCode"], 401)
        self.assertIn(
            "/.well-known/oauth-protected-resource/mcp", result["headers"]["www-authenticate"]
        )

    def test_upstream_status_and_session_header_preserved(self):
        upstream = Mock(
            status=202, headers={"content-type": "application/json", "mcp-session-id": "session"}
        )
        upstream.read.return_value = b""
        with (
            patch.object(proxy.boto3, "client") as client,
            patch.object(proxy, "urlopen") as open_url,
        ):
            client.return_value.get_parameter.return_value = {"Parameter": {"Value": "runtime"}}
            open_url.return_value.__enter__.return_value = upstream
            result = proxy.handler(self.request, None)
        self.assertEqual(result["statusCode"], 202)
        self.assertEqual(result["body"], "")
        self.assertEqual(result["headers"]["mcp-session-id"], "session")

    def test_auth_error_and_transport_failure_remain_distinct(self):
        for error, status in (
            (HTTPError("url", 401, "unauthorized", {}, None), 401),
            (HTTPError("url", 404, "expired", {}, None), 404),
            (URLError("offline"), 503),
        ):
            with (
                self.subTest(status=status),
                patch.object(proxy.boto3, "client") as client,
                patch.object(proxy, "urlopen", side_effect=error),
            ):
                client.return_value.get_parameter.return_value = {"Parameter": {"Value": "runtime"}}
                self.assertEqual(proxy.handler(self.request, None)["statusCode"], status)
