import React, { useState } from 'react';
import DecisionReview from './DecisionReview';
import { canExecute } from './alexaConversation';

export default function Coordination({ api, timeline, incident, incidentState, onRefresh }) {
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const latest = incidentState?.latest_assessment;
  const actions = incidentState?.actions || timeline.filter(item => item.action_id && item.proposal);
  async function perform(task) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await task(); } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <><section className="card"><h2>Assessment and coordinated actions</h2>
    {message && <p role="status">{message}</p>}
    {!latest && <p>{incident ? 'Waiting for an assessment.' : 'Select an incident.'}</p>}
    {latest?.status === 'assessment_failed' && <p role="alert">Assessment unavailable; no actions authorized. Use Retry assessment above.</p>}
    {latest?.assessment && <article><span className="badge">AI ASSESSMENT · SIMULATED EVIDENCE</span>
      {!incidentState?.assessment_current && <p role="status">Historical assessment — not current authorization.</p>}
      <h3>{latest.assessment.incident_type.replaceAll('_', ' ')} · {latest.assessment.severity}</h3><p>{latest.assessment.summary}</p>
      <p>Model confidence: {Math.round(latest.assessment.confidence * 100)}% (not a calibrated probability)</p>
      <details><summary>Evidence references</summary><p>{latest.assessment.evidence_ids.join(', ')}</p></details>
      {latest.assessment.uncertainties.map((value, index) => <p key={index}>Uncertainty: {value}</p>)}
    </article>}
    {actions.map(action => <article key={action.action_id}><h3>{action.proposal.device_name || action.proposal.device_id} · {action.proposal.action.replaceAll('_', ' ')}</h3>
      <p>{action.status.replaceAll('_', ' ')} — {action.result || action.policy_reason}</p>
      {action.alternate_plan && <p>{action.alternate_plan}</p>}
      {!['succeeded', 'failed'].includes(action.status) && !canExecute(action, incidentState) && <p className="notice">Not currently eligible. Review current evidence and policy.</p>}
      <p>Policy {action.policy_version} · Evidence revision {action.evidence_revision ?? 'legacy'}</p>
      {action.status === 'pending_confirmation' && <button disabled={busy || !canExecute(action, incidentState)} onClick={() => perform(async () => {
        const outcome = await api(`/incidents/${incident}/actions/${action.action_id}/confirm`, { method: 'POST', body: JSON.stringify({ confirm: true, assessment_id: action.assessment_id }) });
        await onRefresh(); setMessage(outcome.result || 'Confirmation processed; inspect the outcome.');
      })}>Confirm {action.proposal.action.replaceAll('_', ' ')}</button>}
    </article>)}
  </section><DecisionReview api={api} incident={incident} timeline={timeline} state={incidentState} onRefresh={() => perform(onRefresh)}/></>;
}
