import React, { useEffect, useRef, useState } from 'react';
import { deviceTypes, humanize, signalPayload } from './devices';
import { incidentLabel, incidentName } from './incidentNames';
import { deliveryRows } from './signalQueue';

export default function SimulationStudio({ api, household, catalog, ready, selected, incidents, onAccepted, onBusy, navigate, disabled, deviceSelection, embedded = false, map, briefing }) {
  const storageKey = 'aenea-studio-' + household;
  const [drafts, setDrafts] = useState(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey)); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });
  const [deviceId, setDeviceId] = useState(''), [kind, setKind] = useState(''), [observation, setObservation] = useState('');
  const [target, setTarget] = useState('new'), [name, setName] = useState('');
  const [runIncident, setRunIncident] = useState(() => drafts.find(row => row.payload)?.payload.incident_id || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const lock = useRef(false), stop = useRef(false), mounted = useRef(true), currentDrafts = useRef(drafts);
  const device = catalog.devices.find(item => item.id === deviceId);
  const pending = drafts.some(row => row.payload && row.status !== 'accepted');
  const unsent = drafts.filter(row => row.checked && row.status !== 'accepted');
  const defaultName = device ? `${device.room || catalog.locations.find(site => site.id === device.location_id)?.name || 'Household'} · ${humanize(kind || 'alert')}`.slice(0, 120) : 'Simulated incident';
  useEffect(() => {
    if (!deviceSelection) return;
    if (pending || lock.current) { setNotice('Retry the pending delivery before selecting another device.'); return; }
    const chosen = catalog.devices.find(item => item.id === deviceSelection.id);
    if (!chosen) return;
    setDeviceId(chosen.id); setKind(deviceTypes[chosen.type]?.kinds[0] || ''); setObservation(''); setNotice('');
  }, [deviceSelection]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; }; }, []);
  function update(next) {
    // Persist before delivery so an uncertain retry retains its exact event identity.
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    currentDrafts.current = next;
    if (mounted.current) setDrafts(next);
  }
  function patch(id, fields) { update(currentDrafts.current.map(row => row.id === id ? { ...row, ...fields } : row)); }
  function stage() {
    if (lock.current || pending || disabled || !ready || !device?.enabled || !deviceTypes[device.type]?.kinds.includes(kind)) return null;
    if (currentDrafts.current.length >= 50) throw new Error('Clear completed scenario entries before adding more (50 maximum).');
    const row = { id: crypto.randomUUID(), deviceId, kind, observation: observation.trim() || `Synthetic ${humanize(kind)} detected. Cause and occupancy unverified.`, checked: true, status: 'draft' };
    update([...currentDrafts.current, row]); setObservation(''); return row;
  }
  async function send(nextOnly = false, onlyId = null) {
    if (lock.current || disabled || !ready || !household) return;
    const rows = deliveryRows(currentDrafts.current, onlyId, nextOnly);
    if (!rows.length) return;
    lock.current = true; stop.current = false; setBusy(true); onBusy(true); setError(''); setNotice('');
    const uncertain = currentDrafts.current.find(row => row.payload && row.status !== 'accepted');
    const incident = uncertain?.payload.incident_id || runIncident || (target === 'new' ? crypto.randomUUID() : target);
    setRunIncident(incident);
    try {
      for (const row of rows) {
        if (stop.current) break;
        const currentDevice = catalog.devices.find(item => item.id === row.deviceId);
        const location = catalog.locations.find(item => item.id === currentDevice?.location_id);
        if (!row.payload && (!currentDevice || !location)) throw new Error('A queued device was removed. Remove its draft or restore the device.');
        const generatedName = `${currentDevice?.room || location?.name || 'Household'} · ${humanize(row.kind)}`.slice(0, 120);
        const payload = row.payload || { ...signalPayload(row, currentDevice, location, household, incident), incident_name: name.trim() || generatedName };
        patch(row.id, { payload, status: 'sending' });
        try {
          const receipt = await api('/events', { method: 'POST', body: JSON.stringify(payload) });
          patch(row.id, { status: 'accepted', receipt, checked: false });
          if (mounted.current) onAccepted(receipt.incident_id);
        } catch (failure) { patch(row.id, { status: 'retry' }); throw failure; }
      }
      if (mounted.current) setNotice(stop.current ? 'Paused after the current alert.' : 'Alert accepted. The incident briefing updates as processing completes.');
    } catch (failure) { if (mounted.current) { setError(failure.message); setScenarioOpen(true); } }
    finally { lock.current = false; if (mounted.current) setBusy(false); onBusy(false); }
  }
  function add(sendNow = false) {
    setError('');
    try {
      const row = stage();
      if (!row) return;
      if (sendNow) void send(false, row.id);
      else { setScenarioOpen(true); setNotice('Added to scenario. Send the selected alerts together or send the next one.'); }
    } catch (failure) { setError(failure.message); }
  }
  const composer = <section className="card alert-composer" aria-label="Device alert composer">
    <h2>{embedded ? 'Create an alert' : 'Simulation Studio'}</h2>
    {!catalog.devices.length && <p>Add a device in Settings to begin. <button onClick={() => navigate('settings')}>Open Settings</button></p>}
    <form onSubmit={event => { event.preventDefault(); add(true); }}><fieldset disabled={busy || !ready || pending || disabled}>
      <legend>{device ? device.name : 'Select a device'}</legend>
      <label>Device<select required value={deviceId} onChange={event => { const chosen = catalog.devices.find(item => item.id === event.target.value); setDeviceId(chosen?.id || ''); setKind(deviceTypes[chosen?.type]?.kinds[0] || ''); setObservation(''); }}><option value="">Choose a device or click the map</option>{catalog.devices.map(item => <option key={item.id} value={item.id}>{catalog.locations.find(site => site.id === item.location_id)?.name} / {item.room || 'Unassigned'} / {item.name}{item.enabled ? '' : ' (disabled)'}</option>)}</select></label>
      <label>Signal type<select required value={kind} onChange={event => setKind(event.target.value)}><option value="">Choose a signal</option>{(deviceTypes[device?.type]?.kinds || []).map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>
      <label>Additional details (optional)<input maxLength={600} value={observation} onChange={event => setObservation(event.target.value)} placeholder="E.g. water detected near the doorway"/></label>
      <small>Extra information reported by this simulated device. Leave blank to use a default description.</small>
      <label>Send to<select disabled={!!runIncident} value={runIncident || target} onChange={event => setTarget(event.target.value)}><option value="new">Start new incident</option>{runIncident && !incidents.some(item => item.incident_id === runIncident) && <option value={runIncident}>{drafts.find(row => row.payload?.incident_id === runIncident)?.payload.incident_name || 'Current scenario incident'} · processing</option>}{selected && selected !== runIncident && !incidents.some(item => item.incident_id === selected) && <option value={selected}>{incidentLabel({ incident_id: selected })}</option>}{incidents.map(item => <option key={item.incident_id} value={item.incident_id}>{incidentLabel(item)}</option>)}</select></label>
      {target === 'new' && !runIncident && <label>Incident name (optional)<input maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder={defaultName}/></label>}
      {runIncident && <p>Continuing: <strong>{incidentName(incidents.find(item => item.incident_id === runIncident) || { name: drafts.find(row => row.payload?.incident_id === runIncident)?.payload.incident_name, incident_id: runIncident })}</strong></p>}
      {device && !device.enabled && <p>Enable this device in Settings before sending an alert.</p>}
      <div className="actions"><button className="primary" disabled={!device?.enabled || !kind}>Send alert now</button><button type="button" disabled={!device?.enabled || !kind} onClick={() => add(false)}>Add to scenario</button></div>
    </fieldset></form>
    {runIncident && <button disabled={busy || pending} onClick={() => { update(currentDrafts.current.filter(row => row.status !== 'accepted')); setRunIncident(''); setTarget('new'); setName(''); setNotice('Next alert starts a new incident. Saved evidence is unchanged.'); }}>Start a separate incident</button>}
    <details open={scenarioOpen || pending} onToggle={event => setScenarioOpen(event.currentTarget.open)}><summary>Scenario · {drafts.filter(row => row.status !== 'accepted').length} unsent alerts</summary>
      <p>Add device alerts to the scenario first, then send selected alerts together or one at a time.</p>
      <ol className="signal-queue">{drafts.map(row => <li key={row.id}><label><input type="checkbox" checked={row.checked} disabled={busy || pending || row.status === 'accepted'} onChange={event => patch(row.id, { checked: event.target.checked })}/>{catalog.devices.find(item => item.id === row.deviceId)?.name || 'Removed device'} · {humanize(row.kind)}</label><small>{row.status === 'sending' && !busy ? 'Delivery uncertain — retry' : row.status}</small>{row.status === 'draft' && <button disabled={busy || pending} onClick={() => update(currentDrafts.current.filter(item => item.id !== row.id))}>Remove</button>}</li>)}</ol>
      {!unsent.length && <p>Add at least one alert to send a scenario.</p>}
      <div className="actions"><button disabled={busy || disabled || !ready || !unsent.length} onClick={() => send()}>{pending ? 'Retry pending alerts' : 'Send scenario'}</button><button disabled={busy || disabled || !ready || !unsent.length} onClick={() => send(true)}>Send next</button>{busy && <button onClick={() => { stop.current = true; }}>Pause</button>}
        <button disabled={busy || pending || !drafts.length} onClick={() => { update(drafts.map(row => ({ id: crypto.randomUUID(), deviceId: row.deviceId, kind: row.kind, observation: row.observation, checked: true, status: 'draft' }))); setRunIncident(''); setTarget('new'); setName(''); }}>Replay as new incident</button>
        <button disabled={busy || pending || !drafts.length} onClick={() => { update([]); setRunIncident(''); }}>Clear scenario</button></div>
      {pending && <p>Delivery may already have succeeded. Retry uses the same event identity and does not duplicate accepted alerts.</p>}
      <small>Automatic assessment supports 20 signals per incident.</small>
    </details>
    {notice && <p role="status" className="notice">{notice}</p>}{error && <p role="alert" className="error">{error}</p>}
  </section>;
  return embedded ? <div className="command-workbench"><div>{map}{briefing}</div>{composer}</div> : composer;
}
