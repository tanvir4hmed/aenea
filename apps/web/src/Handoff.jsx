import React, { useMemo, useRef, useState } from 'react';
import { createMcpClient } from './mcp';

const readable = value => String(value || 'unknown').replaceAll('_', ' ');
function handoffText(data) {
  const assessment = data.assessment?.assessment;
  return [
    'AENEA — SYNTHETIC COORDINATION HANDOFF', data.notice,
    'Incident: ' + data.incident.incident_id, 'Prepared: ' + data.generated_at,
    'Stage: ' + readable(data.incident.status),
    'Acknowledged: ' + (data.incident.acknowledged_by ? 'yes (not resolved)' : 'not recorded'),
    'Coverage: ' + (data.partial ? 'PARTIAL — additional records exist' : 'bounded pages returned without a continuation cursor'),
    data.consistency, '', 'LATEST AI ASSESSMENT (NOT VERIFIED FACT)',
    'Assessment freshness: ' + (data.assessment_current ? 'current evidence revision' : 'outdated or unavailable'),
    'Human review: ' + (data.incident.decision_review || 'unreviewed'),
    assessment?.summary || 'No valid assessment is available.',
    ...(assessment?.uncertainties || []).map(x => 'Uncertainty: ' + x), '',
    'SELF-REPORTS — NOT VERIFIED SAFETY',
    ...data.people.map(p => `${p.person}: ${readable(p.status)} at ${p.reported_at}`),
    'Anyone without a report is unknown; no complete household roster is asserted.', '',
    'SIMULATED SIGNALS',
    ...data.signals.map(({ event: e }) => `${e.occurred_at} | ${e.source.source_id} | ${e.kind} | ${e.observation} | evidence ${e.event_id}`), '',
    'VIRTUAL ACTIONS',
    ...data.actions.map(a => `${a.proposal.device_id}: ${readable(a.proposal.action)} — ${a.status}: ${a.result || a.policy_reason}${a.alternate_plan ? ' | Alternate: ' + a.alternate_plan : ''}`),
    '', 'No physical device action, medical diagnosis or emergency dispatch. Refresh and review before sharing.',
  ].join('\n');
}

export default function Handoff({ config, incident }) {
  const client = useMemo(() => createMcpClient(config), [config.apiUrl, config.clientId, config.cognitoDomain]);
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  async function prepare() {
    if (!incident || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice(''); setData(null);
    try { setData(await client.call('get_responder_summary', { incident_id: incident })); }
    catch (e) { setError(`Handoff could not be prepared: ${e.message} No summary was sent or saved. Refresh the incident and try again.`); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="card handoff-sheet">
    <span className="badge">SYNTHETIC HANDOFF · NOT SENT TO RESPONDERS</span>
    <h2>A shared incident brief</h2>
    <p>Prepare a reviewable snapshot of saved signals, self-reports and virtual outcomes. This screen does not contact any monitoring or emergency service.</p>
    <button className="primary no-print" disabled={!incident || busy} onClick={prepare}>{busy ? 'Preparing…' : 'Prepare / refresh handoff'}</button>
    {!incident && <p>Select an incident above.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {data && <>
      <p>Incident <code>{data.incident.incident_id}</code><br/>Prepared <time dateTime={data.generated_at}>{new Date(data.generated_at).toLocaleString()}</time></p>
      <p className={data.partial ? 'error' : 'notice'}>{data.partial ? 'PARTIAL SNAPSHOT: additional records exist. Review the full timeline and household pages before sharing.' : 'Returned pages have no continuation cursor. This is not a verified all-clear.'}</p>
      <p>{data.consistency}</p>
      <h3>Latest AI assessment</h3>
      <p>Evidence revision {data.incident.event_count} · Assessed revision {data.assessment?.evidence_revision ?? 'legacy / unavailable'} · {data.assessment_current ? 'Current' : 'Outdated / unavailable'} · Human review: {data.incident.decision_review || 'unreviewed'}</p>
      <p>{data.assessment?.assessment?.summary || 'No valid assessment available. Do not infer a safe outcome.'}</p>
      {data.assessment?.assessment?.uncertainties?.map((u, i) => <p key={i}>Uncertainty: {u}</p>)}
      <h3>Household reports</h3>
      {!data.people.length && <p>No check-ins recorded; household status unknown.</p>}
      <ul>{data.people.map(p => <li key={p.sk}>{p.person}: {readable(p.status)} — self-report at {new Date(p.reported_at).toLocaleString()}</li>)}</ul>
      <h3>Virtual action outcomes</h3>
      {!data.actions.length && <p>No virtual action results recorded.</p>}
      {data.actions.map(a => <article className="handoff-action" key={a.action_id}>
        <strong>{readable(a.proposal.device_id)} · {readable(a.status)}</strong>
        <p>{a.result || a.policy_reason}</p>{a.alternate_plan && <p>Alternate plan: {a.alternate_plan}</p>}
      </article>)}
      <h3>Signal evidence</h3>
      <ol className="timeline">{[...data.signals].sort((a,b) => a.event.occurred_at.localeCompare(b.event.occurred_at)).map(({ event: e }) => <li key={e.event_id}>
        <strong>{readable(e.kind)}</strong><p>{e.observation}</p><small>{e.source.source_id} · {new Date(e.occurred_at).toLocaleString()}</small><small>Evidence {e.event_id}</small>
      </li>)}</ol>
      <div className="actions no-print"><button onClick={async () => {
        try { await navigator.clipboard.writeText(handoffText(data)); setNotice('Snapshot copied. Review it before sharing. Nothing was sent automatically.'); }
        catch { setNotice('Clipboard unavailable. Select and copy the text below instead.'); }
      }}>Copy text</button><button onClick={() => window.print()}>Print snapshot</button></div>
      <details className="no-print"><summary>Plain-text handoff</summary><pre className="evidence-json">{handoffText(data)}</pre></details>
      {notice && <p role="status" className="no-print">{notice}</p>}
    </>}
  </section>;
}
