import React, { useState } from 'react';
import { incidentName } from './incidentNames';
import SimulationAllowance from './SimulationAllowance';

export default function IncidentSummary({ api, incident, state, navigate, onRefresh, onRenamed, compact = false }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [name, setName] = useState('');
  const current = state?.incident?.incident_id === incident ? state.incident : null;
  async function perform(task) {
    if (busy) return;
    setBusy(true); setError('');
    try { await task(); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  if (!incident) return <section className="card incident-management"><h2>Incident status</h2><p>Select an incident to inspect it, or run a saved simulation to create one.</p></section>;
  return <section className="card incident-management" aria-label="Incident status and management">
    <h2>{compact ? 'Incident record' : incidentName(current || { incident_id: incident })}</h2>
    <div className="actions"><span className="badge">{!current ? 'Loading incident' : current.resolved_at ? 'Resolved' : 'Open incident'}</span>{current && <span>{current.event_count || 0} recorded signals</span>}</div>
    {current?.location_name && <p>{current.location_name}{current.rooms?.length ? ' · ' + current.rooms.join(', ') : ''}</p>}
    {current?.resolved_at ? <p>Closed by a person. The recorded evidence remains available for review.</p> : <p>Read the latest briefing or ask about this incident in Live assistance.</p>}
    <div className="actions"><button className="primary" onClick={() => navigate('alexa-sim')}>Open live overview</button>{!compact && <button onClick={() => navigate('incident-history')}>View incident history</button>}</div>
    <details className="incident-tools"><summary>Manage this incident</summary>
      {!current?.resolved_at && <div className="actions"><button disabled={busy || !current} onClick={() => perform(async () => { await api(`/incidents/${incident}/reassess`, { method: 'POST', body: '{}' }); await onRefresh(); })}>Retry assessment</button><button disabled={busy || !current} onClick={() => {
        if (window.confirm('Resolve this incident? Pending actions will be blocked. This does not certify that the location is safe.')) perform(async () => { await api(`/incidents/${incident}/resolve`, { method: 'POST', body: JSON.stringify({ confirm: true, revision: Number(current.event_count), note_revision: Number(current.note_revision || 0) }) }); await onRefresh(); await onRenamed(); });
      }}>Resolve incident</button></div>}
      <form className="rename-incident" onSubmit={event => { event.preventDefault(); perform(async () => { await api(`/incidents/${incident}/name`, { method: 'PUT', body: JSON.stringify({ name: name.trim() }) }); await onRefresh(); await onRenamed(); setName(''); }); }}><label>Incident name<input required maxLength={120} disabled={busy || !current} value={name} placeholder={incidentName(current)} onChange={event => setName(event.target.value)}/></label><button disabled={busy || !current || !name.trim() || name.trim() === current?.name}>Save name</button></form>
    </details>
    {!compact && <SimulationAllowance api={api} incident={incident} state={state} refresh={onRefresh}/>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
