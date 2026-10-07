"""Only scopes belonging to the configured resource become internal permissions."""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "functions"))
from oauth_scopes import permission_scopes


class OAuthScopeTests(unittest.TestCase):
    def test_other_resources_and_legacy_scope_strings_do_not_grant_permissions(self):
        with patch.dict(os.environ, {"MCP_RESOURCE_URL": "https://api.example/mcp"}):
            self.assertEqual(
                permission_scopes({"aenea/read", "https://other.example/mcp/write"}), set()
            )
            self.assertEqual(permission_scopes({"https://api.example/mcp/read"}), {"aenea/read"})
            self.assertEqual(
                permission_scopes(
                    {"https://api.example/mcp/read", "https://api.example/mcp/write"}
                ),
                {"aenea/read", "aenea/write"},
            )
