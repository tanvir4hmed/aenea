"""Keep model transport bounded without limiting stored evidence."""

import json


def bounded_payload(events, summary, notes, maximum=60000):
    body = {
        "events": list(events),
        "state_summary": dict(summary),
        "unverified_notes": {**notes, "items": list(notes["items"])},
    }
    while len(json.dumps(body, default=float).encode()) > maximum:
        if body["unverified_notes"]["items"]:
            body["unverified_notes"]["items"].pop(0)
            body["unverified_notes"]["partial"] = True
        elif len(body["events"]) > 1:
            body["events"].pop()
            body["state_summary"]["sampled"] = True
        else:
            raise ValueError("A single evidence record exceeds model transport capacity")
    body["state_summary"]["selected_count"] = len(body["events"])
    return body
