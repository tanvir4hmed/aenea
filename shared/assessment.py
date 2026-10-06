"""Versioned reasoner contract shared by AgentCore and Lambda boundaries."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, strict=True)


class IncidentAssessment(Contract):
    schema_version: Literal["1.0"] = "1.0"
    incident_type: Literal[
        "smoke",
        "carbon_monoxide",
        "heat",
        "gas_leak",
        "water_leak",
        "medical_sos",
        "severe_weather",
        "security_alarm",
        "uncertain",
    ]
    severity: Literal["informational", "warning", "urgent"]
    confidence: float = Field(ge=0, le=1)
    summary: str = Field(min_length=1, max_length=1200)
    evidence_ids: list[str] = Field(min_length=1, max_length=32)
    uncertainties: list[str] = Field(max_length=10)
    # Keep the wire field for existing consumers; device commands are unsupported.
    actions: list[dict] = Field(default_factory=list, max_length=0)

    def check_evidence(self, events):
        known = {event["event_id"] for event in events}
        cited = set(self.evidence_ids)
        if not cited <= known:
            raise ValueError("Assessment cites unknown evidence")
        return self


class RoutingDecision(Contract):
    decision: Literal["create", "join"]
    name: str = Field(min_length=1, max_length=120)
    reason: str = Field(min_length=1, max_length=500)


class ConversationIntent(Contract):
    intent: Literal["status", "timeline", "acknowledge", "unsupported"]
    topic: Literal["general", "occupancy", "devices", "assessment", "uncertainty", "changes"] = (
        "general"
    )
