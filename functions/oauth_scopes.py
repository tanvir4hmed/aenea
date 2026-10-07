"""Map verified wire scopes to internal permissions without accepting other resources."""

import os


def permission_scopes(scopes):
    resource = os.environ["MCP_RESOURCE_URL"]
    return {
        f"aenea/{permission}"
        for permission in ("read", "write")
        if f"{resource}/{permission}" in scopes
    }
