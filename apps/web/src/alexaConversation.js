export const commands = [
  { phrase: 'What is happening?', tool: 'get_incident_status', aliases: ['status', 'incident status'] },
  { phrase: 'Show the timeline', tool: 'get_incident_timeline', aliases: ['show actions', 'what actions are available'] },
  { phrase: 'Who has checked in?', tool: 'get_household_status', aliases: ['who is safe', 'household status'] },
  { phrase: 'Acknowledge incident', tool: 'acknowledge_incident', aliases: ['acknowledge'] },
  { phrase: 'Prepare a handoff', tool: 'get_responder_summary', aliases: ['handoff', 'prepare handoff'] },
];
const normalize = text => text.toLowerCase().replace(/[?.!]/g, '').trim().replace(/\s+/g, ' ');
export function commandFor(text) { return commands.find(command => [command.phrase, ...command.aliases].some(value => normalize(value) === normalize(text))); }
const readable = value => String(value || 'unknown').replaceAll('_', ' ');
export function describe(tool, data) {
  if (tool === 'get_responder_summary') return `Handoff prepared for incident ${data.incident.incident_id.slice(0, 8)}. ${data.partial ? 'This snapshot is partial; more records exist. ' : ''}${data.assessment_current ? '' : 'The assessment is outdated or unavailable. '}${data.notice} Nothing has been dispatched.`;
  if (tool === 'get_incident_status') {
    const prefix = `Incident ${data.incident.incident_id.slice(0, 8)}, evidence revision ${data.incident.event_count}. `;
    const assessment = data.assessment?.assessment;
    if (!assessment) return prefix + (data.assessment?.message || `Status: ${readable(data.incident.status)}. No validated assessment is available yet.`);
    return prefix + (data.assessment_current ? '' : 'Previous assessment; newer evidence is awaiting assessment or revision tracking is unavailable. ')
      + (data.incident.decision_review === 'rejected' ? 'A reviewer rejected this assessment; its actions cannot execute. ' : '')
      + assessment.summary + (assessment.uncertainties.length ? ' Still uncertain: ' + assessment.uncertainties.join(' ') : '');
  }
  if (tool === 'get_household_status') return (data.items?.length ? data.items.map(person => `${person.person}: ${readable(person.status)} (self-reported at ${person.reported_at})`).join('. ') : 'No check-ins are recorded for this incident.')
    + (data.next_cursor ? ' More reports are available.' : '') + ' Reports do not verify current safety; unreported people remain unknown.';
  if (tool === 'report_person_status') return `${data.person}: ${readable(data.status)} recorded for this incident. This is a self-report.`;
  if (tool === 'acknowledge_incident') return 'Incident acknowledged. It is not resolved and nobody has been marked safe.';
  if (tool === 'get_incident_timeline') return `${data.items.length} records loaded.${data.next_cursor ? ' More records are available.' : ''} Review the action cards for eligibility and recorded outcomes.`;
  return `${readable(data.status)}: ${data.result || data.policy_reason || 'Read the saved result before retrying.'}`;
}

export function canExecute(action, context, now = Date.now()) {
  return Boolean(context?.assessment_current && context.incident.decision_review !== 'rejected'
    && context.incident.latest_assessment === action.assessment_id
    && context.incident.event_count === action.evidence_revision && now < action.expires_at * 1000);
}
