"""Bounded, tenant-bound pagination tokens; tokens are not authorization."""
import base64
import json


def decode_cursor(value, partition, prefix=""):
    if not isinstance(value, str) or not 1 <= len(value) <= 4096:
        raise ValueError("Invalid cursor")
    try:
        key = json.loads(base64.b64decode(value, altchars=b"-_", validate=True))
    except (ValueError, UnicodeError) as exc:
        raise ValueError("Invalid cursor") from exc
    if (not isinstance(key, dict) or set(key) != {"pk", "sk"}
            or key["pk"] != partition or not isinstance(key["sk"], str)
            or not key["sk"].startswith(prefix)):
        raise ValueError("Invalid cursor")
    return key
