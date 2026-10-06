import { readableText } from './liveAssistance.js';

export const commands = [
  { phrase: 'What is happening?', label: 'Current status', tool: 'get_incident_status', aliases: ['status', 'incident status'] },
  { phrase: 'Show the timeline', label: 'Evidence timeline', tool: 'get_incident_timeline', aliases: ['timeline'] },
  { phrase: 'Acknowledge incident', label: 'I have seen this', tool: 'acknowledge_incident', aliases: ['acknowledge'] },
];
const normalize = text => text.toLowerCase().replace(/[?.!]/g, '').trim().replace(/\s+/g, ' ');
export function commandFor(text) { return commands.find(command => [command.phrase, ...command.aliases].some(value => normalize(value) === normalize(text))); }
export function describe(tool, data) {
  if (tool === 'get_responder_summary') return `Handoff prepared. ${data.partial ? 'This snapshot is partial; more records exist. ' : ''}${data.assessment_current ? '' : 'The assessment is outdated or unavailable. '}${readableText(data.notice || '')} Nothing has been dispatched.`;
  if (tool === 'get_incident_status') {
    if (data.incident?.resolved_at) return 'This incident was resolved by human confirmation. Resolution does not verify safety.';
    const assessment = data.assessment?.assessment;
    const severity = readableText(data.severity || assessment?.severity || 'not yet assessed');
    const summary = assessment?.summary ? readableText(assessment.summary) : 'Evidence is being collected; an assessment is not available yet.';
    return `${severity.charAt(0).toUpperCase() + severity.slice(1)}. ${summary}${assessment && !data.assessment_current ? ' This assessment is awaiting an update.' : ''}${data.incident?.decision_review === 'rejected' ? ' A reviewer rejected this assessment; review the evidence before relying on it.' : ''}`;
  }
  if (tool === 'get_household_status') return (data.items?.length ? data.items.map(person => `${person.person}: ${readableText(person.status)}`).join('. ') : 'No check-ins are recorded for this incident.') + ' These are self-reports; current occupancy and safety are unverified.';
  if (tool === 'report_person_status') return `${data.person}: ${readableText(data.status)} recorded as a self-report.`;
  if (tool === 'acknowledge_incident') return 'Incident acknowledged. It remains open; nobody has been marked safe.';
  if (tool === 'get_incident_timeline') return `${data.items?.length || 0} records loaded.${data.next_cursor ? ' More records are available.' : ''} Open Incident history for the sequence of signals and decisions.`;
  return 'No supported incident response was returned.';
}

export const conversationPrefix = 'aenea:conversation:';
const maximumTurns = 20, maximumConversations = 24, retentionMs = 7 * 24 * 60 * 60 * 1000;
export function conversationKey(household, incident) {
  return household && incident ? `${conversationPrefix}${encodeURIComponent(household)}:${encodeURIComponent(incident)}` : '';
}
function validTurns(messages) {
  return Array.isArray(messages) ? messages.filter(item => item && typeof item.phrase === 'string' && typeof item.reply === 'string' && Number.isFinite(item.at))
    .slice(-maximumTurns).map(item => ({ phrase: item.phrase.slice(0, 600), reply: item.reply.slice(0, 4000), at: item.at, source: item.source === 'voice' ? 'voice' : 'text' })) : [];
}
export function readConversation(storage, key, now = Date.now()) {
  if (!key) return [];
  try {
    const saved = JSON.parse(storage.getItem(key));
    if (!saved || !Number.isFinite(saved.savedAt) || now - saved.savedAt > retentionMs || saved.savedAt > now) { storage.removeItem(key); return []; }
    return validTurns(saved.messages);
  } catch { return []; }
}
export function writeConversation(storage, key, messages, now = Date.now()) {
  if (!key) return false;
  try {
    storage.setItem(key, JSON.stringify({ savedAt: now, messages: validTurns(messages) }));
    const saved = [];
    for (let index = 0; index < storage.length; index++) {
      const candidate = storage.key(index);
      if (!candidate?.startsWith(conversationPrefix)) continue;
      let entry;
      try { entry = JSON.parse(storage.getItem(candidate)); } catch { /* Prune malformed entries. */ }
      saved.push({ key: candidate, at: Number(entry?.savedAt) || 0 });
    }
    saved.sort((a, b) => b.at - a.at);
    saved.forEach((entry, index) => { if (entry.key !== key && (index >= maximumConversations || now - entry.at > retentionMs)) storage.removeItem(entry.key); });
    return true;
  } catch { return false; }
}
export function clearConversations(storage, household) {
  const prefix = household ? `${conversationPrefix}${encodeURIComponent(household)}:` : conversationPrefix;
  try { for (let index = storage.length - 1; index >= 0; index--) { const key = storage.key(index); if (key?.startsWith(prefix)) storage.removeItem(key); } } catch { /* Storage may be unavailable. */ }
}

// Browser speech engines may emit duplicate final results. One microphone session sends once.
export function finalTranscriptOnce(isCurrent, submit) {
  let submitted = false;
  return event => {
    if (submitted || !isCurrent()) return;
    const results = Array.from(event.results || []).slice(event.resultIndex || 0);
    const text = results.filter(result => result.isFinal).map(result => result[0]?.transcript || '').join(' ').trim();
    if (!text) return;
    submitted = true;
    submit(text);
  };
}
