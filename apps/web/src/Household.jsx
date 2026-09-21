import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createMcpClient } from './mcp';

const statuses = { unknown: 'Unknown', safe: 'Reported safe', needs_help: 'Needs help', not_home: 'Reported away' };

export default function Household({ config, incident }) {
  const client = useMemo(() => createMcpClient(config.apiUrl), [config.apiUrl]);
  const [people, setPeople] = useState([]), [cursor, setCursor] = useState(null);
  const [person, setPerson] = useState('Resident A'), [status, setStatus] = useState('unknown');
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false);
  async function load(next = null) {
    const data = await client.call('get_household_status', { incident_id: incident, cursor: next });
    setPeople(old => next ? [...new Map([...old, ...data.items].map(p => [p.sk, p])).values()] : data.items);
    setCursor(data.next_cursor); setLoaded(true);
  }
  async function perform(task) {
    if (lock.current || !incident) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  }
  useEffect(() => { if (incident) perform(() => load()); }, [incident]);
  return <section className="card">
    <span className="badge">SIMULATED HOUSEHOLD · SHARED MCP STATE</span>
    <h2>Who has checked in?</h2>
    <p>Each report belongs only to this incident. Motion does not identify people. A past report is not proof of current safety, and missing residents remain unknown.</p>
    {!incident ? <p>Select an incident above.</p> : <>
      <form onSubmit={e => { e.preventDefault(); perform(async () => {
        await client.call('report_person_status', { incident_id: incident, person: person.trim(), status });
        setNotice('Check-in saved.'); await load();
      }); }}>
        <fieldset disabled={busy}><legend>Record a synthetic self-report</legend>
          <label>Resident name <input required maxLength={60} pattern="[A-Za-z0-9 _\-]+" value={person} onChange={e => setPerson(e.target.value)} /></label>
          <label>Reported status <select value={status} onChange={e => setStatus(e.target.value)}>
            {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <p>No resident account or personal identity is verified. Use fictional names only.</p>
          <button type="submit" className="primary" disabled={!person.trim()}>Save check-in</button>
        </fieldset>
      </form>
      <div className="row"><h3>Saved reports</h3><button disabled={busy} onClick={() => perform(() => load())}>Refresh reports</button></div>
      {!loaded && <p>No reports loaded yet.</p>}
      {loaded && !people.length && <p>No check-ins recorded. Household safety is unknown.</p>}
      <div className="resident-grid">{people.map(p => <article className={'resident status-' + p.status} key={p.sk}>
        <h3>{p.person}</h3><strong>{statuses[p.status] || 'Unknown'}</strong>
        <p>Self-reported <time dateTime={p.reported_at}>{new Date(p.reported_at).toLocaleString()}</time></p>
      </article>)}</div>
      {cursor && <button disabled={busy} onClick={() => perform(() => load(cursor))}>Load more reports — list incomplete</button>}
    </>}
    {busy && <p role="status">Updating shared household state…</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="error">{error} Refresh reports before retrying a write.</p>}
  </section>;
}
