"""Server-owned capability gates; browser settings cannot enable retired controls."""

import os


def device_actions_enabled():
    # Kept opt-in for historical contract tests and deliberate rollback only.
    return os.environ.get("DEVICE_ACTIONS_ENABLED", "false") == "true"
