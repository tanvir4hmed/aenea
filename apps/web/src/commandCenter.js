export function incidentBriefing(state, selected) {
  if (state?.incident?.resolved_at) return 'Incident resolved by your confirmation. New alerts will be assigned separately. Resolution does not certify safety.';
  if (!selected) return 'Choose an incident or create a device alert to begin.';
  if (!state?.incident?.incident_id) return 'Waiting for saved incident context. Processing may still be underway.';
  const assessment = state.latest_assessment;
  if (!assessment?.assessment) return assessment?.message || 'Evidence is being collected. A current assessment is not available yet.';
  return `${state.assessment_current ? '' : 'Previous assessment. New evidence is awaiting assessment. '}${state.incident.decision_review === 'rejected' ? 'This assessment has been rejected; its actions cannot execute. ' : ''}${assessment.assessment.summary}`;
}

export function reportingDevices(timeline, state) {
  if (state?.active_devices) return new Set(state.active_devices.map(device => device.device_id));
  return new Set([...timeline.filter(item => item.event).map(item => item.event),
    ...(state?.latest_assessment?.evidence_snapshot || [])].map(event => event.source?.source_id).filter(Boolean));
}
