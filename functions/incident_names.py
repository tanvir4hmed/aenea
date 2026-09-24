"""Bounded display names, separate from immutable incident identities."""

def validate_name(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 120:
        raise ValueError("Incident name must contain 1–120 characters")
    if any(ord(char) < 32 for char in value):
        raise ValueError("Incident name contains control characters")
    return value.strip()


def rename_incident(table, owner, incident, body):
    from botocore.exceptions import ClientError
    from common import response
    if not isinstance(body, dict) or set(body) != {"name"}:
        raise ValueError("Expected an incident name")
    name = validate_name(body["name"])
    try:
        table.update_item(Key={"pk": f"H#{owner}", "sk": "INCIDENT#" + incident},
                          UpdateExpression="SET #name = :name",
                          ConditionExpression="attribute_exists(pk) AND attribute_not_exists(deletion_started_at)",
                          ExpressionAttributeNames={"#name": "name"},
                          ExpressionAttributeValues={":name": name})
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        return response(409, {"error": "Incident unavailable; refresh before renaming"})
    return response(200, {"incident_id": incident, "name": name})
