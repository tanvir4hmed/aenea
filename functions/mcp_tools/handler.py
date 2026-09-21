"""Private Lambda invoked only by the JWT-verifying MCP runtime."""
from household_tools import dispatch
from common import response


def handler(event, context):
    try:
        principal = event["principal"]
        owner = principal["sub"]
        if not isinstance(owner, str) or not owner or len(owner) > 128:
            raise ValueError("Invalid principal")
        result = dispatch(owner, set(principal["scope"].split()), event["tool"], event["arguments"])
        return response(200, result)
    except PermissionError:
        return response(403, {"error": "Required tool scope is missing"})
    except (ValueError, TypeError, KeyError):
        return response(400, {"error": "Invalid tool arguments or record not found"})
