"""Shared HTTP and household boundary helpers."""
import json
import os
from decimal import Decimal


def response(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(body, default=lambda x: (int(x) if x == x.to_integral_value() else float(x)) if isinstance(x, Decimal) else str(x)),
    }


def household(request):
    claims = request.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    subject = claims.get("sub")
    if not subject:
        raise PermissionError("Authentication required")
    # Demo tenancy: one Cognito identity owns one household.
    return subject


def table_name():
    return os.environ["STATE_TABLE"]
