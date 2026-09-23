import React, { useRef, useState } from 'react';
import { scenarios, scenarioEvent } from './scenarios';

export default function ScenarioLab({ api, household, onAccepted, onBusy, disabled }) {
  const [choice, setChoice] = useState('smoke'), [run, setRun] = useState(null);
  const [pending, setPending] = useState(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false);
  const scenario = scenarios.find(s => s.id === choice);
  async function send() {
    if (!household || lock.current || disabled) return;
    lock.current = true; setBusy(true); onBusy(true); setError(''); setNotice('');
    const current = run || { incident: crypto.randomUUID(), index: 0, receipts: [] };
    // Keep the exact payload through uncertain HTTP outcomes. Retry cannot invent a new event.
    const payload = pending || scenarioEvent(scenario.steps[current.index], household, current.incident);
    setRun(current); setPending(payload);
    try {
      const receipt = await api('/events', { method: 'POST', body: JSON.stringify(payload) });
      setRun({ ...current, index: current.index + 1, receipts: [...current.receipts, receipt] });
      setPending(null);
      setNotice('Signal accepted by ingestion. Assessment/action completion is not yet implied.');
      onAccepted(receipt.incident_id);
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  const complete = run && run.index >= scenario.steps.length;
  return <section className="card scenario-lab">
    <span className="badge">AUTHORED SIMULATIONS · LIVE BACKEND INGESTION</span>
    <h2>Walk through a household incident</h2>
    <p>No cameras or sensors are connected. These event cards send synthetic observations through IncidentBridge; assessments and outcomes come only from the hosted backend.</p>
    <label>Scenario <select disabled={!!run || busy} value={choice} onChange={e => setChoice(e.target.value)}>
      {scenarios.map(s => <option value={s.id} key={s.id}>{s.title}</option>)}
    </select></label><p>{scenario.description}</p>
    <ol className="scenario-steps">{scenario.steps.map((s, index) => <li key={s.source + index} className={run && index < run.index ? 'accepted' : ''}>
      <span className="badge">{s.category === 'camera' ? 'CAMERA EVENT SIMULATION — NO FOOTAGE' : 'SENSOR SIMULATION'}</span>
      <h3>{s.kind.replaceAll('_', ' ')}</h3><p>{s.observation}</p><small>{s.source}</small>
      {run?.receipts[index] && <p>Accepted · event <code>{run.receipts[index].event_id}</code></p>}
    </li>)}</ol>
    <p>Configure virtual action permissions in Settings before starting a run. These walkthroughs use sample sources, separate from your saved devices.</p>
    <div className="actions"><button className="primary" disabled={!household || busy || disabled || complete} onClick={send}>
      {busy ? 'Sending…' : pending ? 'Retry identical signal' : run ? 'Send next signal' : 'Start new incident and send first signal'}
    </button>{run && <button disabled={busy || !!pending} onClick={() => { setRun(null); setError(''); setNotice(''); }}>New scenario run (keeps saved history)</button>}</div>
    {run && <p>Run incident: <code>{run.incident}</code></p>}
    {complete && <p>All inputs accepted. Review actual assessment, check-ins and outcomes in the command center and handoff.</p>}
    {pending && !busy && <p>Uncertain delivery: retry the identical signal before starting another run. Pending payload stays in memory while navigating; a full page reload discards it.</p>}
    {notice && <p role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
  </section>;
}
