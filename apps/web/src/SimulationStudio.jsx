import React, { useEffect, useRef, useState } from 'react';
import { deviceTypes, humanize, signalPayload } from './devices';

export default function SimulationStudio({ api, household, catalog, ready, selected, incidents, onAccepted, onBusy, navigate, disabled, deviceSelection, embedded = false }) {
  const storageKey = 'aenea-studio-' + household;
  const [drafts, setDrafts] = useState(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey)); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });
  const [deviceId, setDeviceId] = useState(''), [kind, setKind] = useState(''), [observation, setObservation] = useState('');
  const [locationId, setLocationId] = useState('');
  const [target, setTarget] = useState('new');
  const [runIncident, setRunIncident] = useState(() => drafts.find(row => row.payload)?.payload.incident_id || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false), stop = useRef(false), mounted = useRef(true);
  const currentDrafts = useRef(drafts);
  const device = catalog.devices.find(item => item.id === deviceId);
  const eligible = catalog.devices.filter(item => item.enabled && (!locationId || item.location_id === locationId));
  const pending = drafts.some(row => row.payload && row.status !== 'accepted');
  const unsent = drafts.filter(row => row.checked && row.status !== 'accepted');
  useEffect(() => {
    if (!deviceSelection) return;
    if (pending || busy) { setNotice('Finish or retry the pending delivery before selecting another device.'); return; }
    const chosen = catalog.devices.find(item => item.id === deviceSelection.id);
    if (!chosen) return;
    setLocationId(chosen.location_id); setDeviceId(chosen.id);
    setKind(deviceTypes[chosen.type]?.kinds[0] || '');
    setNotice(chosen.enabled ? `${chosen.name} selected. Choose an observation, add it to the queue, then send.` : `${chosen.name} is disabled. Enable it in Settings before creating an alert.`);
  }, [deviceSelection]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; }; }, []);
  function update(next) {
    currentDrafts.current = next;
    if (mounted.current) setDrafts(next);
    // Persist the exact uncertain payload before a request, so reload/retry keeps its identity.
    sessionStorage.setItem(storageKey, JSON.stringify(next));
  }
  function patch(id, fields) { update(currentDrafts.current.map(row => row.id === id ? { ...row, ...fields } : row)); }
  function add(event) {
    event.preventDefault(); setError('');
    if (!device || !device.enabled || !deviceTypes[device.type].kinds.includes(kind)) return;
    if (drafts.length >= 50) { setError('A run supports up to 50 signals. Clear completed drafts to add more.'); return; }
    update([...drafts, { id: crypto.randomUUID(), deviceId, kind, observation: observation.trim() || `Synthetic ${humanize(kind)} observation. Cause and occupancy unverified.`, checked: true, status: 'draft' }]);
    setObservation('');
  }
  async function send(nextOnly = false) {
    if (lock.current || disabled || !ready || !household) return;
    const rows = currentDrafts.current.filter(row => row.checked && row.status !== 'accepted');
    if (!rows.length) return;
    lock.current = true; stop.current = false; setBusy(true); onBusy(true); setError(''); setNotice('');
    const uncertain = currentDrafts.current.find(row => row.payload && row.status !== 'accepted');
    const incident = uncertain?.payload.incident_id || runIncident || (target === 'new' ? crypto.randomUUID() : target);
    setRunIncident(incident);
    try {
      for (const row of (nextOnly ? rows.slice(0, 1) : rows)) {
        if (stop.current) break;
        const currentDevice = catalog.devices.find(item => item.id === row.deviceId);
        const location = catalog.locations.find(item => item.id === currentDevice?.location_id);
        if (!row.payload && (!currentDevice || !location)) throw new Error('A queued device or location was deleted. Remove that draft or restore the device.');
        const payload = row.payload || signalPayload(row, currentDevice, location, household, incident);
        patch(row.id, { payload, status: 'sending' });
        try {
          const receipt = await api('/events', { method: 'POST', body: JSON.stringify(payload) });
          patch(row.id, { status: 'accepted', receipt, checked: false });
          if (mounted.current) onAccepted(receipt.incident_id);
        } catch (failure) { patch(row.id, { status: 'retry' }); throw failure; }
      }
      if (mounted.current) setNotice(stop.current ? 'Paused. Already accepted signals remain in the incident.' : 'Signals accepted. Review the assessment and action results in Command center.');
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); onBusy(false); }
  }
  function replay() {
    update(drafts.map(row => ({ id: crypto.randomUUID(), deviceId: row.deviceId, kind: row.kind, observation: row.observation, checked: true, status: 'draft' })));
    setRunIncident(''); setTarget('new'); setError(''); setNotice('Ready to replay as a new incident.');
  }
  return <section className="card">
    <div className="row"><div><h2>{embedded ? 'Create device alerts' : 'Simulation Studio'}</h2><p>Stage device signals, then send selected alerts together or one at a time.</p></div><button disabled={busy} onClick={() => navigate('settings')}>Manage devices</button></div>
    {!catalog.devices.length && <div className="empty-state"><h3>Add devices to begin</h3><p>Create locations and simulation devices in Settings, then compose an incident here.</p></div>}
    <p>Automatic assessment currently supports up to 20 signals per incident. Larger incidents retain their evidence but require review; automatic actions stop.</p>
    <form onSubmit={add}><fieldset disabled={busy || !ready || pending}><legend>Add a signal</legend><div className="form-grid">
      <label>Filter by location<select value={locationId} onChange={event => { setLocationId(event.target.value); setDeviceId(''); setKind(''); }}><option value="">All locations</option>{catalog.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Device<select required value={deviceId} onChange={event => { const value = event.target.value; setDeviceId(value); setKind(deviceTypes[catalog.devices.find(item => item.id === value)?.type]?.kinds[0] || ''); }}><option value="">Choose a device</option>{eligible.map(item => <option value={item.id} key={item.id}>{catalog.locations.find(location => location.id === item.location_id)?.name} / {item.name}</option>)}</select></label>
      <label>Signal<select required value={kind} onChange={event => setKind(event.target.value)}><option value="">Choose a signal</option>{(deviceTypes[device?.type]?.kinds || []).map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>
      <label>Observation (optional)<input maxLength={600} value={observation} onChange={event => setObservation(event.target.value)} placeholder="Describe this simulated observation"/></label>
    </div><button disabled={!device}>Add to queue</button></fieldset></form>
    <div className="row"><h3>Signal queue · {drafts.length}</h3><div className="actions"><button disabled={busy || pending} onClick={() => update(drafts.map(row => ({ ...row, checked: row.status !== 'accepted' })))}>Select unsent</button><button disabled={busy || pending} onClick={() => update(drafts.map(row => ({ ...row, checked: false })))}>Deselect all</button></div></div>
    {!drafts.length && <p>No signals queued. Add one device observation or several for a larger incident.</p>}
    <ol className="signal-queue">{drafts.map((row, index) => { const source = catalog.devices.find(item => item.id === row.deviceId); return <li key={row.id}>
      <label><input type="checkbox" checked={row.checked} disabled={busy || pending || row.status === 'accepted'} onChange={event => patch(row.id, { checked: event.target.checked })}/><strong>{source?.name || 'Deleted device'} · {humanize(row.kind)}</strong></label>
      <p>{row.observation}</p><span className="badge">{row.status === 'sending' && !busy ? 'Uncertain — retry same signal' : row.status}</span>
      {row.receipt && <p>Incident {row.receipt.incident_id.slice(0, 8)} · Event {row.receipt.event_id.slice(0, 8)}</p>}
      <div className="actions"><button disabled={busy || pending || index === 0 || row.status === 'accepted'} onClick={() => { const next = [...drafts]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; update(next); }}>Move earlier</button><button disabled={busy || pending || row.status === 'accepted'} onClick={() => update(drafts.filter(item => item.id !== row.id))}>Remove draft</button></div>
    </li>; })}</ol>
    <label>Send to<select disabled={busy || pending || !!runIncident} value={target} onChange={event => setTarget(event.target.value)}><option value="new">New incident</option>{selected && !incidents.some(item => item.incident_id === selected) && <option value={selected}>{selected.slice(0, 8)}</option>}{incidents.map(item => <option key={item.incident_id} value={item.incident_id}>{item.incident_id.slice(0, 8)}</option>)}</select></label>
    {(runIncident || drafts.some(row => row.payload)) && <p>Run incident: <code>{runIncident || drafts.find(row => row.payload)?.payload.incident_id}</code></p>}
    <div className="actions"><button className="primary" disabled={disabled || busy || !ready || !unsent.length} onClick={() => send(false)}>{pending ? 'Retry pending and continue selected' : 'Send selected signals'}</button><button disabled={disabled || busy || !ready || !unsent.length} onClick={() => send(true)}>Send next selected signal</button>{busy && <button onClick={() => { stop.current = true; setNotice('Pausing after the current request…'); }}>Pause after current signal</button>}
      <button disabled={busy || pending || !drafts.length} onClick={replay}>Replay queue as new incident</button>
      <button disabled={busy || pending || !runIncident} onClick={() => { update(currentDrafts.current.filter(row => row.status !== 'accepted')); setRunIncident(''); setTarget('new'); setNotice('Next unsent signals will start a new incident. Previously accepted signals remain saved.'); }}>Start a separate incident</button>
      <button disabled={busy || pending || !drafts.length} onClick={() => { update([]); setRunIncident(''); setNotice('Draft queue cleared. Saved incident evidence is unchanged.'); }}>Clear queue</button>
    </div>
    {pending && <><p>Delivery is pending or uncertain. Retry preserves the original event ID; accepted signals are not resent.</p><button disabled={busy} onClick={() => {
      if (window.confirm('Discard uncertain local drafts? A signal may already exist in the incident. This does not delete server evidence; inspect the incident before sending replacements.')) {
        update(drafts.filter(row => !row.payload || row.status === 'accepted')); setError('');
      }
    }}>Discard uncertain drafts</button></>}
    {notice && <p role="status" className="notice">{notice}</p>}{error && <p role="alert" className="error">{error}</p>}
  </section>;
}
