import React, { useMemo, useState } from 'react';
import { incidentName } from './incidentNames';
import IncidentSummary from './IncidentSummary';
import DecisionReview from './DecisionReview';
import HistoryRecord from './HistoryRecord';
import { isMapleHouse } from './house';

const readable = value => String(value || 'Unknown').replaceAll('_', ' ');
const stamp = item => item.event?.occurred_at || item.recorded_at || item.reported_at || '';

export default function IncidentHistory({ api, incidents, catalog, selected, onSelect, state, timeline, loading, onRefreshList, onMoreIncidents, onRefresh, onRefreshEvidence = onRefresh, evidenceReady = true, evidenceBusy = false, evidenceError = '', onMoreEvidence, onDeleted, navigate }) {
  const [opened, setOpened] = useState(null), [tab, setTab] = useState('overview');
  const [query, setQuery] = useState(''), [location, setLocation] = useState(''), [status, setStatus] = useState('');
  const [page, setPage] = useState(1), [eventPage, setEventPage] = useState(1), [eventType, setEventType] = useState('');
  const [confirm, setConfirm] = useState(false), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const site = item => item.location_name || catalog.locations.find(value => value.id === item.location_id)?.name || 'Location unavailable';
  const filtered = useMemo(() => incidents.filter(item => (!location || item.location_id === location)
    && (!status || (item.resolved_at ? 'resolved' : 'open') === status)
    && `${incidentName(item)} ${site(item)} ${item.incident_id}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))), [incidents, catalog, query, location, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10)), current = Math.min(page, pages);
  const incident = opened === selected ? state?.incident || incidents.find(item => item.incident_id === opened) : null;
  const events = timeline.filter(item => (item.event || item.kind || item.person) && (!eventType || (eventType === 'signals' ? !!item.event : !item.event)))
    .slice().sort((a, b) => String(stamp(b)).localeCompare(String(stamp(a))) || String(b.sk).localeCompare(String(a.sk)));
  const eventPages = Math.max(1, Math.ceil(events.length / 10)), currentEventPage = Math.min(eventPage, eventPages);
  function open(id) { onSelect(id); setOpened(id); setTab('overview'); setEventPage(1); setEventType(''); setConfirm(false); setChecked(false); setMessage(''); }
  function selectTab(next) {
    setTab(next);
    if (next !== 'overview' && !evidenceReady && !evidenceBusy) onRefreshEvidence();
  }
  async function remove() {
    if (!checked || busy || !incident) return;
    setBusy(true); setMessage('');
    try {
      const result = await api(`/incidents/${opened}/delete`, { method: 'POST', body: JSON.stringify({ confirm_incident_id: opened }) });
      onDeleted(opened); setOpened(null); setConfirm(false); setChecked(false);
      setMessage(result.cleanup_status === 'completed' ? 'Incident deleted. Cleanup complete.' : 'Incident removed from the list. Stored evidence cleanup is queued; track it in Settings → Data controls.');
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  if (opened) return <>
    <section className="card history-heading"><div className="row"><button onClick={() => { setOpened(null); setMessage(''); }}>← All incidents</button><button disabled={busy || !incident} onClick={() => { setConfirm(true); setChecked(false); }}>Delete incident</button></div>
      <h2>{incidentName(incident || { incident_id: opened })}</h2><p>{incident ? site(incident) : 'Loading incident…'} · {incident?.resolved_at ? 'Resolved' : 'Open'} · {incident?.event_count ?? '—'} signals</p>
      {incident?.created_at && <small>Started {new Date(incident.created_at).toLocaleString()}</small>}
      <div className="actions"><button onClick={() => navigate('alexa-sim')}>Open live overview</button><button onClick={() => navigate('command-center')}>Open Command Center</button></div>
    </section>
    {confirm && <section className="card delete-confirmation" role="region" aria-label="Confirm incident deletion"><h3>Delete {incidentName(incident)}?</h3><p>Evidence, assessments, notes and action records will be removed from active storage. This cannot be undone in the app. Cleanup runs in the background; retained service logs and backups follow their retention periods.</p><label><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)}/>I want to delete this incident and its stored evidence.</label><div className="actions"><button disabled={!checked || busy} onClick={remove}>{busy ? 'Requesting deletion…' : 'Delete permanently'}</button><button disabled={busy} onClick={() => setConfirm(false)}>Cancel</button></div></section>}
    {message && <p role="status" className="notice">{message}</p>}
    <nav className="view-tabs" aria-label="Incident sections">{[['overview', 'Incident record'], ['evidence', 'Evidence timeline'], ['review', 'Decision review']].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => selectTab(value)}>{label}</button>)}</nav>
    {tab !== 'overview' && evidenceBusy && <p role="status">Loading saved evidence… Current incident updates continue separately.</p>}
    {tab !== 'overview' && evidenceError && <p className="error" role="alert">Evidence could not be refreshed. {evidenceError} <button disabled={evidenceBusy} onClick={onRefreshEvidence}>Retry evidence</button></p>}
    {!state?.incident || state.incident.incident_id !== opened ? <section className="card" role="status">Loading incident details…</section> : <>
      {tab === 'overview' && <><IncidentSummary key={opened} compact api={api} incident={opened} state={state} navigate={navigate} onRefresh={onRefresh} onRenamed={onRefreshList}/>{!!state.actions?.length && <details className="card"><summary>Historical response records</summary><p>Read-only records from the earlier response system. Device controls are no longer enabled.</p><ul className="outcome-log">{state.actions.map(action => <li key={action.action_id}><strong>{action.proposal?.device_name || ({ virtual_notification: 'In-app notification', virtual_valve: 'Virtual water valve', virtual_lights: 'Virtual lights', virtual_siren: 'Virtual alarm' })[action.proposal?.device_id] || 'Previously recorded output'}</strong><span>{readable(action.status)} · {readable(action.proposal?.action)}</span><p>{action.result || action.policy_reason}</p></li>)}</ul></details>}</>}
      {tab === 'review' && <><DecisionReview key={opened} api={api} timeline={timeline} incident={opened} state={state} onRefresh={() => Promise.all([onRefresh(), onRefreshEvidence()])}/>{onMoreEvidence && <button disabled={evidenceBusy} onClick={onMoreEvidence}>Load more saved decisions & evidence</button>}</>}
      {tab === 'evidence' && <section className="card" aria-busy={evidenceBusy}><div className="row"><h2>Evidence timeline</h2><button disabled={evidenceBusy} onClick={onRefreshEvidence}>Refresh evidence</button></div><label>Record type<select value={eventType} onChange={event => { setEventType(event.target.value); setEventPage(1); }}><option value="">All records</option><option value="signals">Device signals</option><option value="decisions">Decisions & notes</option></select></label><p>{events.length} matching loaded records · newest loaded first</p>
        {evidenceReady && !evidenceBusy && !events.length && <p>No matching evidence loaded.</p>}<ol className="timeline">{events.slice((currentEventPage - 1) * 10, currentEventPage * 10).map(item => <HistoryRecord key={item.sk} item={item}/>)}</ol>
        {eventPages > 1 && <nav className="pagination" aria-label="Evidence pages"><button disabled={currentEventPage === 1} onClick={() => setEventPage(currentEventPage - 1)}>Previous</button><span>{currentEventPage} / {eventPages}</span><button disabled={currentEventPage === eventPages} onClick={() => setEventPage(currentEventPage + 1)}>Next</button></nav>}
        {onMoreEvidence && <button disabled={evidenceBusy} onClick={onMoreEvidence}>Load more stored evidence</button>}
      </section>}
    </>}
  </>;
  return <section className="card" aria-busy={loading}><div className="row"><div><h2>Incident history</h2><p>Find an incident, review its response or manage its records.</p></div><button disabled={loading} onClick={onRefreshList}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {message && <p role="status" className="notice">{message}</p>}
    <div className="history-filters"><label>Search<input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Incident name or ID"/></label>{!isMapleHouse(catalog) && <label>Location<select value={location} onChange={event => { setLocation(event.target.value); setPage(1); }}><option value="">All locations</option>{catalog.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option></select></label></div>
    <p>{filtered.length} matching / {incidents.length} loaded · newest loaded first</p>
    {!filtered.length && <p>{loading ? 'Loading incidents…' : 'No incidents match. Adjust filters or load more records.'}</p>}
    <div className="history-list">{filtered.slice((current - 1) * 10, current * 10).map(item => <button className="history-row" key={item.incident_id} onClick={() => open(item.incident_id)}><span><strong>{incidentName(item)}</strong><small>{site(item)}{item.rooms?.length ? ' · ' + item.rooms.join(', ') : ''}</small></span><span><span className="badge">{item.resolved_at ? 'Resolved' : 'Open'}</span><small>{readable(item.status)} · {item.event_count || 0} signals</small></span><time>{item.created_at ? new Date(item.created_at).toLocaleString() : 'Date unavailable'}</time><span aria-hidden="true">→</span></button>)}</div>
    {pages > 1 && <nav className="pagination" aria-label="Incident pages"><button disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><span>{current} / {pages}</span><button disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></nav>}
    {onMoreIncidents && <button disabled={loading} onClick={onMoreIncidents}>Load more stored incidents</button>}
  </section>;
}
