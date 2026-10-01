"""Model interprets bounded read/acknowledgment intents, never device approvals."""

import json
import os
import uuid
import boto3
from botocore.config import Config
from assessment import ConversationIntent
from common import response


def interpret(text):
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 600:
        raise ValueError("Use a command of 1–600 characters")
    result = boto3.client(
        "bedrock-agentcore",
        config=Config(connect_timeout=2, read_timeout=10, retries={"total_max_attempts": 1}),
    ).invoke_agent_runtime(
        agentRuntimeArn=os.environ["REASONER_ARN"],
        runtimeSessionId=str(uuid.uuid4()),
        contentType="application/json",
        payload=json.dumps({"task": "command", "text": text}).encode(),
    )
    return ConversationIntent.model_validate(json.loads(result["response"].read())["intent"]).intent


def message(owner, incident, body, scopes):
    from household_tools import dispatch

    if not {"aenea/read", "aenea/write"} <= set(scopes):
        raise PermissionError("Read and write scopes required for conversation commands")
    try:
        intent = interpret(body.get("text"))
    except ValueError:
        raise
    except Exception:
        return response(
            503,
            {
                "error": "Command interpreter unavailable. Use status buttons or save a note. No action taken."
            },
        )
    allowed = {
        "status": "get_incident_status",
        "timeline": "get_incident_timeline",
        "acknowledge": "acknowledge_incident",
    }
    if intent not in allowed:
        return response(
            200,
            {
                "tool": None,
                "message": "Try asking what happened, which devices reported, whether the assessment is current, or ask to see the evidence timeline. Device actions must be reviewed and confirmed on their action card.",
            },
        )
    return response(
        200,
        {
            "tool": allowed[intent],
            "data": dispatch(owner, scopes, allowed[intent], {"incident_id": incident}),
        },
    )
