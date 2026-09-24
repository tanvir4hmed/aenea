import React, { useState } from 'react';
import { canExecute } from './alexaConversation';
import { incidentName } from './incidentNames';

const readable = value => String(value || '').replaceAll('_', ' ');
const outputs = { virtual_siren: 'Virtual alarm', virtual_lights: 'Virtual lights', virtual_notification: 'In-app notification', virtual_valve: 'Virtual water valve' };

export default function IncidentSummary({ api, incident, state, timeline, navigate, onRefresh, onRenamed }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [name, setName] = useState('');
  const assessment = state?.latest_assessment;
  const context = { ...state, assessment, incident: state?.incident };
  const actions = timeline.filter(item => item.action_id && item.proposal);
  const pending = actions.filter(item => item.status === 'pending_confirmation' && canExecute(item, context));
  const recent = timeline.filter(item => item.event || item.kind).sort((a, b) => String(b.event?.occurred_at || b.recorded_at || '').localeCompare(String(a.event?.occurred_at || a.recorded_at || ''))).slice(0, 3);
  async function perform(task) {
    if (busy) return;
    setBusy(true); setError('');
    try { await task(); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  if (!incident) return null;
  return <section aria-label="Incident decisions">
    <div className="row"><h2>{incidentName(state?.incident || { incident_id: incident })}</h2><button onClick={() => navigate('incident-history')}>View details and history</button></div>
    <details className="rename-incident"><summary>Rename incident</summary><form onSubmit={event => { event.preventDefault(); perform(async () => { await api(`/incidents/${incident}/name`, { method: 'PUT', body: JSON.stringify({ name: name.trim() }) }); await onRefresh(); await onRenamed(); setName(''); }); }}><label>Incident name<input required maxLength={120} value={name} placeholder={incidentName(state?.incident)} onChange={event => setName(event.target.value)}/></label><button disabled={busy || !name.trim()}>Save name</button></form></details>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="decision-cards">
      <article className="card"><h3>Latest decision</h3><span className="badge">{state?.assessment_current ? 'Current assessment' : 'Awaiting assessment'}</span><p>{assessment?.assessment?.summary || assessment?.message || 'Processing the saved evidence.'}</p>{state?.incident?.decision_review === 'rejected' && <p>Assessment rejected; proposed actions cannot execute.</p>}<button onClick={() => navigate('incident-history')}>Review evidence and reasoning</button></article>
      <article className="card"><h3>Needs confirmation</h3>{!pending.length && <p>No eligible confirmation in the loaded records.</p>}{pending.map(action => <div key={action.action_id}><strong>{outputs[action.proposal.device_id] || readable(action.proposal.device_id)}</strong><p>{action.policy_reason}</p><button disabled={busy} onClick={() => perform(async () => { await api(`/incidents/${incident}/actions/${action.action_id}/confirm`, { method: 'POST', body: JSON.stringify({ confirm: true, assessment_id: action.assessment_id }) }); await onRefresh(); })}>Confirm {readable(action.proposal.action)}</button></div>)}</article>
      <article className="card"><h3>Virtual actions</h3>{!actions.length && <p>No actions recorded yet.</p>}{actions.map(action => <p key={action.action_id}><strong>{outputs[action.proposal.device_id] || readable(action.proposal.device_id)}</strong><br/>{readable(!['succeeded', 'failed', 'blocked', 'expired'].includes(action.status) && !canExecute(action, context) ? 'outdated_or_expired' : action.status)}<small className="action-reason">{action.result || action.policy_reason}</small></p>)}</article>
    </div>
    <details className="card"><summary>Recent activity · {recent.length} updates</summary>{recent.map(item => <p key={item.sk}><strong>{readable(item.event?.kind || item.kind)}</strong> · {new Date(item.event?.occurred_at || item.recorded_at).toLocaleTimeString()}<br/>{item.event?.observation || item.data?.result || item.data?.message || 'Decision recorded'}</p>)}<button onClick={() => navigate('incident-history')}>Full timeline</button></details>
  </section>;
}
