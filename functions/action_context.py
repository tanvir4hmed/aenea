"""Complete same-location hazard veto with a transaction-checkable evidence epoch."""

from boto3.dynamodb.conditions import Key
from incident_state import snapshot


def location_evidence(table, owner, location):
    key = {"pk": f"H#{owner}", "sk": "SITE#" + location}
    epoch = table.get_item(Key=key, ConsistentRead=True).get("Item", {}).get("revision", 0)
    events = []
    query = {
        "KeyConditionExpression": Key("pk").eq(f"H#{owner}") & Key("sk").begins_with("INCIDENT#"),
        "ConsistentRead": True,
        "Limit": 100,
    }
    while True:
        page = table.query(**query)
        for incident in page["Items"]:
            if (
                incident.get("location_id") == location
                and not incident.get("resolved_at")
                and not incident.get("deletion_started_at")
            ):
                events.extend(snapshot(table, owner, incident["incident_id"])["policy_events"])
        if not page.get("LastEvaluatedKey"):
            break
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    return events, key, epoch
