"""Read-only incident APIs, always scoped by the authenticated identity."""
import base64
import json
import uuid

import boto3
from boto3.dynamodb.conditions import Key

from common import household, response, table_name

table = boto3.resource("dynamodb").Table(table_name())


def handler(request, context):
    if request["routeKey"] == "GET /health":
        return response(200, {"service": "aenea", "phase": "reasoner-safety"})
    try:
        owner = household(request)
        params = request.get("queryStringParameters") or {}
        incident_id = (request.get("pathParameters") or {}).get("incident_id")
        partition = f"H#{owner}"
        prefix = "INCIDENT#"
        if incident_id:
            incident_id = str(uuid.UUID(incident_id))
            partition += f"#I#{incident_id}"
            prefix = ""  # Evidence, assessments, policy decisions and action results share this partition.
        query = {
            "KeyConditionExpression": Key("pk").eq(partition) & Key("sk").begins_with(prefix),
            "Limit": 50, "ConsistentRead": True,
        }
        if params.get("cursor"):
            cursor = json.loads(base64.urlsafe_b64decode(params["cursor"]).decode())
            if (not isinstance(cursor, dict) or set(cursor) != {"pk", "sk"}
                    or cursor["pk"] != partition or not cursor["sk"].startswith(prefix)):
                raise ValueError("Invalid cursor")
            query["ExclusiveStartKey"] = cursor
        result = table.query(**query)
        next_cursor = None
        if result.get("LastEvaluatedKey"):
            next_cursor = base64.urlsafe_b64encode(
                json.dumps(result["LastEvaluatedKey"]).encode()
            ).decode()
        return response(200, {"household_id": owner, "items": result["Items"],
                              "next_cursor": next_cursor})
    except PermissionError:
        return response(401, {"error": "Authentication required"})
    except (ValueError, TypeError, KeyError, UnicodeError, AttributeError):
        return response(400, {"error": "Invalid query"})
