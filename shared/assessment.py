"""Versioned reasoner contract shared by AgentCore and Lambda boundaries."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, strict=True)


class Proposal(Contract):
    action: Literal["lights_on", "siren_on", "notify", "close_valve"]
    device_id: Literal["virtual_lights", "virtual_siren", "virtual_notification", "virtual_valve"]
    rationale: str = Field(min_length=1, max_length=500)
    evidence_ids: list[str] = Field(min_length=1, max_length=20)


class IncidentAssessment(Contract):
    schema_version: Literal["1.0"] = "1.0"
    incident_type: Literal["smoke", "carbon_monoxide", "water_leak", "medical_sos", "severe_weather", "uncertain"]
    severity: Literal["informational", "warning", "urgent"]
    confidence: float = Field(ge=0, le=1)
    summary: str = Field(min_length=1, max_length=1200)
    evidence_ids: list[str] = Field(min_length=1, max_length=20)
    uncertainties: list[str] = Field(max_length=10)
    actions: list[Proposal] = Field(max_length=4)

    def check_evidence(self, events):
        known = {event["event_id"] for event in events}
        cited = set(self.evidence_ids)
        for action in self.actions:
            cited.update(action.evidence_ids)
        if not cited <= known:
            raise ValueError("Assessment cites unknown evidence")
        if len({(a.action, a.device_id) for a in self.actions}) != len(self.actions):
            raise ValueError("Duplicate action proposals")
        return self
