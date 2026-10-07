"""JWT checks shared by every MCP tool; no network access at import time."""

import jwt
from typing import Any

READ_TOOLS = frozenset(
    {
        "get_incident_status",
        "get_incident_timeline",
        "get_household_status",
        "get_action_status",
        "get_responder_summary",
    }
)


def verify_token(
    token: str, signing_key: Any, issuer: str, client_id: str, resource: str, tool: str
) -> dict[str, Any]:
    claims = jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        issuer=issuer,
        audience=resource,
        options={"require": ["exp", "iat", "sub", "client_id", "token_use", "aud"]},
    )
    if claims["client_id"] != client_id or claims["token_use"] != "access":
        raise ValueError("Invalid access token")
    scopes = set(claims.get("scope", "").split())
    if resource + "/read" not in scopes or (
        tool not in READ_TOOLS and resource + "/write" not in scopes
    ):
        raise ValueError("Required tool scope is missing")
    return claims
