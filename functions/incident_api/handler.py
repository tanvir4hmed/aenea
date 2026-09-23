"""Read-only incident APIs, always scoped by the authenticated identity."""
import base64
import json
import uuid

import boto3
from boto3.dynamodb.conditions import Key

from common import household, response, table_name
from cursors import decode_cursor
from revisions import current_assessment

table = boto3.resource("dynamodb").Table(table_name())


def handler(request, context):
    if request["routeKey"] == "GET /health":
        return response(200, {"service": "aenea", "status": "handler-responsive", "dependency_checks": False})
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
            query["ExclusiveStartKey"] = decode_cursor(params["cursor"], partition, prefix)
        result = table.query(**query)
        next_cursor = None
        if result.get("LastEvaluatedKey"):
            next_cursor = base64.urlsafe_b64encode(
                json.dumps(result["LastEvaluatedKey"]).encode()
            ).decode()
        metadata = {}
        if incident_id:
            summary = table.get_item(Key={"pk": f"H#{owner}", "sk": f"INCIDENT#{incident_id}"}, ConsistentRead=True).get("Item", {})
            latest = table.get_item(Key={"pk": partition, "sk": "ASSESSMENT#" + summary["latest_assessment"]}, ConsistentRead=True).get("Item") if summary.get("latest_assessment") else None
            metadata = {"incident": summary, "latest_assessment": latest,
                        "assessment_current": current_assessment(summary, latest)}
        return response(200, {"household_id": owner, "items": result["Items"],
                              "next_cursor": next_cursor, **metadata})
    except PermissionError:
        return response(401, {"error": "Authentication required"})
    except (ValueError, TypeError, KeyError, UnicodeError, AttributeError):
        return response(400, {"error": "Invalid query"})
