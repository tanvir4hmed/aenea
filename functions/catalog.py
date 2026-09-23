"""Bounded, revision-checked location/device catalog for a single identity."""
import uuid

from botocore.exceptions import ClientError

from common import response

DEVICE_KINDS = {
    "smoke_detector": ["smoke"], "co_detector": ["carbon_monoxide"],
    "leak_sensor": ["water_leak"], "camera": ["motion", "doorbell", "package", "vehicle"],
    "medical_button": ["medical_sos"], "weather_feed": ["severe_weather"],
}


def text(value, maximum, required=True):
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        raise ValueError("Invalid text field")
    return value.strip()


def validate_catalog(body):
    if not isinstance(body, dict) or set(body) != {"revision", "locations", "devices"}:
        raise ValueError("Expected revision, locations and devices")
    if body["revision"] is not None:
        uuid.UUID(body["revision"])
    locations, devices = body["locations"], body["devices"]
    if not isinstance(locations, list) or not isinstance(devices, list) or len(locations) > 30 or len(devices) > 100:
        raise ValueError("Limit: 30 locations and 100 devices")
    seen = set()
    for location in locations:
        if not isinstance(location, dict) or set(location) != {"id", "name", "address"}:
            raise ValueError("Invalid location")
        location["id"] = str(uuid.UUID(location["id"]))
        if location["id"] in seen:
            raise ValueError("Duplicate location")
        seen.add(location["id"])
        location["name"] = text(location["name"], 80)
        location["address"] = text(location["address"], 240, False)
    device_ids = set()
    for device in devices:
        if not isinstance(device, dict) or set(device) != {"id", "location_id", "name", "room", "type", "connection", "enabled"}:
            raise ValueError("Invalid device")
        device["id"] = str(uuid.UUID(device["id"]))
        if device["id"] in device_ids or device["location_id"] not in seen:
            raise ValueError("Device needs a valid location and unique ID")
        device_ids.add(device["id"])
        device["name"] = text(device["name"], 80)
        device["room"] = text(device["room"], 80, False)
        if device["type"] not in DEVICE_KINDS or device["connection"] != "simulation" or type(device["enabled"]) is not bool:
            raise ValueError("Unsupported device configuration")
    return locations, devices


def read_catalog(table, owner):
    item = table.get_item(Key={"pk": f"H#{owner}", "sk": "CATALOG"}, ConsistentRead=True).get("Item", {})
    return {"revision": item.get("revision"), "locations": item.get("locations", []), "devices": item.get("devices", [])}


def save_catalog(table, owner, body):
    locations, devices = validate_catalog(body)
    item = {"pk": f"H#{owner}", "sk": "CATALOG", "revision": str(uuid.uuid4()),
            "locations": locations, "devices": devices}
    condition = {"ConditionExpression": "attribute_not_exists(pk)"}
    if body["revision"] is not None:
        condition = {"ConditionExpression": "revision = :revision", "ExpressionAttributeValues": {":revision": body["revision"]}}
    try:
        table.put_item(Item=item, **condition)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        return response(409, {"error": "Settings changed elsewhere. Reload settings before editing again."})
    return response(200, {key: item[key] for key in ("revision", "locations", "devices")})
