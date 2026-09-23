import React, { useState } from 'react';

function HumanReview({ api, incident, assessment, enabled, onRefresh }) {
  const [note, setNote] = useState(''), [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function save(verdict) {
    const payload = pending || { request_id: crypto.randomUUID(), verdict, note };
    setPending(payload); setBusy(true); setMessage('');
    try {
      await api(`/incidents/${incident}/assessments/${assessment.assessment_id}/review`, { method: 'POST', body: JSON.stringify(payload) });
      setPending(null); setMessage('Review recorded. This is not device-action approval.'); await onRefresh();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <div><label>Review note<input value={note} maxLength={500} disabled={busy || !!pending || !enabled} onChange={event => setNote(event.target.value)} placeholder="What matches or conflicts with the evidence?"/></label>
    <div className="actions">{pending ? <><button disabled={busy || !enabled} onClick={() => save(pending.verdict)}>Retry same review</button><button disabled={busy} onClick={() => { setPending(null); setMessage('Review draft released. Refresh the saved review before submitting another.'); }}>Release review draft</button></> : <><button disabled={busy || !enabled} onClick={() => save('accepted')}>Agree with assessment</button><button disabled={busy || !enabled} onClick={() => save('rejected')}>Reject assessment</button></>}</div>
    <p>Rejection blocks future execution from this assessment. It cannot undo actions already completed. Agreement does not prove the incident or bypass policy.</p>
    {message && <p role="status">{message}</p>}
  </div>;
}

export default function DecisionReview({ api, incident, timeline, state, onRefresh }) {
  const [chosen, setChosen] = useState('');
  const current = state?.latest_assessment;
  const history = [...new Map([...timeline.filter(item => item.sk.startsWith('ASSESSMENT#')), ...(current ? [current] : [])].map(item => [item.assessment_id, item])).values()]
    .sort((a, b) => (b.evidence_revision || 0) - (a.evidence_revision || 0) || b.created_at - a.created_at);
  const assessment = chosen ? history.find(item => item.assessment_id === chosen) : current;
  const fresh = state?.assessment_current && assessment?.assessment_id === current?.assessment_id;
  const previous = history.find(item => item.evidence_revision < assessment?.evidence_revision && item.assessment);
  const snapshot = assessment?.evidence_snapshot || [];
  const cited = new Set(assessment?.assessment?.evidence_ids || []);
  const priorIds = new Set(previous?.evidence_ids || []);
  return <section className="card">
    <div className="row"><h2>Decision review</h2><button disabled={!incident} onClick={() => onRefresh()}>Refresh assessment</button></div>
    {!incident ? <p>Select an incident to review its decisions.</p> : <>
      <p>Evidence revision <strong>{state?.incident?.event_count ?? '…'}</strong> · Assessed revision <strong>{current?.evidence_revision ?? 'Not available'}</strong></p>
      {state && !state.assessment_current && <p className="notice" role="status">New evidence is awaiting assessment, or only a legacy assessment is available. Previous proposals cannot execute.</p>}
      <label>Assessment history<select value={chosen} onChange={event => setChosen(event.target.value)}><option value="">Current published assessment</option>{history.map(item => <option key={item.assessment_id} value={item.assessment_id}>Revision {item.evidence_revision ?? 'legacy'} · {item.assessment_id.slice(0, 8)} · {item.status.replaceAll('_', ' ')}</option>)}</select></label>
      {assessment && <>
        <p><span className="badge">{fresh ? 'CURRENT REVISION' : 'HISTORICAL / SUPERSEDED'}</span> · {new Date(assessment.created_at * 1000).toLocaleString()}</p>
        <div className="verification-grid">{[['Schema', assessment.verification?.schema_valid], ['Citation references', assessment.verification?.citations_valid], ['Complete evidence snapshot', assessment.verification?.complete_snapshot]].map(([label, passed]) => <div key={label}><strong>{label}</strong><p>{passed === true ? 'Passed' : passed === false ? 'Not verified' : 'Not recorded'}</p></div>)}</div>
        <p>These checks verify structure and evidence references, not whether an AI conclusion is true.</p>
        {assessment.assessment ? <><h3>{assessment.assessment.incident_type.replaceAll('_', ' ')} · {assessment.assessment.severity}</h3><p>{assessment.assessment.summary}</p>
          {previous && <p>Compared with loaded revision {previous.evidence_revision}: severity {previous.assessment.severity} → {assessment.assessment.severity}; {snapshot.filter(event => !priorIds.has(event.event_id)).length} added evidence signals.</p>}
          <h3>Evidence used in this revision</h3><ul className="evidence-review">{snapshot.map(event => <li key={event.event_id}><strong>{event.kind.replaceAll('_', ' ')}</strong> · {cited.has(event.event_id) ? 'Cited in summary' : 'Included in input'}<p>{event.observation}</p><small>{event.source.source_id} · {new Date(event.occurred_at).toLocaleString()}</small></li>)}</ul>
          {!snapshot.length && <p>No saved evidence snapshot for this legacy assessment.</p>}
          <h3>Uncertainties</h3>{assessment.assessment.uncertainties.length ? <ul>{assessment.assessment.uncertainties.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p>No uncertainties were listed by the model.</p>}
          <h3>Proposed actions and rationale</h3>{assessment.assessment.actions.map(action => <article key={action.device_id}><strong>{action.action.replaceAll('_', ' ')}</strong><p>{action.rationale}</p><small>Cites: {action.evidence_ids.join(', ')}</small></article>)}
          {!assessment.assessment.actions.length && <p>No device actions proposed.</p>}
          <h3>Human review: {fresh ? state.incident.decision_review || 'unreviewed' : 'Historical revision'}</h3>
          <HumanReview key={assessment.assessment_id} api={api} incident={incident} assessment={assessment} enabled={!!fresh} onRefresh={onRefresh}/>
        </> : <p role="alert">{assessment.message || 'Assessment unavailable. No actions authorized.'}</p>}
      </>}
      <details><summary>Saved review history</summary>{timeline.filter(item => item.kind === 'decision_review').map(item => <p key={item.sk}>{item.data.verdict} · {item.data.assessment_id.slice(0, 8)} · {item.recorded_at}<br/>{item.data.note}</p>)}<p>History contains loaded timeline pages. Load additional events for older reviews.</p></details>
    </>}
  </section>;
}
