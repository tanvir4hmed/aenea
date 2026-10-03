import React, { useEffect, useRef, useState } from 'react';
import { deviceTypes } from './devices';
import { permissionPayload, permissionsChanged } from './responsePermissions';

export default function ActionSettings({ api, catalog = { devices: [], locations: [] }, ready = true, onAddOutput }) {
  const [devices, setDevices] = useState({}), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [revision, setRevision] = useState(null);
  const [saved, setSaved] = useState({}), [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const loadId = useRef(0);
  const outputs = catalog.devices.filter(device => deviceTypes[device.type]?.category === 'actuator');
  const currentPage = Math.min(page, Math.max(1, Math.ceil(outputs.length / 10)));
  const dirty = loaded && permissionsChanged(outputs, devices, saved);
  async function load() {
    const requestId = ++loadId.current;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api('/household/devices');
      if (requestId !== loadId.current) return;
      setDevices(result.devices); setSaved(result.devices); setRevision(result.revision); setLoaded(true);
    } catch (failure) { if (requestId === loadId.current) setError(failure.message); }
    finally { if (requestId === loadId.current) setBusy(false); }
  }
  useEffect(() => { setLoaded(false); if (ready && outputs.length) load(); else setBusy(false); return () => { loadId.current += 1; }; }, [catalog.revision, ready]);
  function change(id, patch) { setDevices(old => ({ ...old, [id]: { ...old[id], ...patch } })); setMessage(''); }
  async function save() {
    if (busy || !dirty || !revision) return;
    const requestId = ++loadId.current;
    setBusy(true); setMessage(''); setError('');
    try {
      const result = await api('/household/devices', { method: 'PUT', body: JSON.stringify({ revision, devices: permissionPayload(outputs, devices) }) });
      if (requestId !== loadId.current) return;
      setDevices(result.devices); setSaved(result.devices); setRevision(result.revision);
      setMessage('Response permissions saved. They apply when an eligible action is next checked.');
    } catch (failure) { if (requestId === loadId.current) setError(failure.message); }
    finally { if (requestId === loadId.current) setBusy(false); }
  }
  return <section className="card" aria-busy={busy}><h2>Response permissions</h2>
    <p>Sensors report what they detect. Response outputs are separate devices: simulated lights, sirens, notifications and water valves. Receiving a sensor signal does not enable an output.</p>
    <p>Choose how each registered output may respond at its saved location. Automatic responses still require current evidence and policy checks. Water valves always need your approval in Live assistance.</p>
    {!ready ? <p role="status">Loading your device inventory…</p> : !outputs.length ? <div className="quiet-state"><h3>No response outputs added</h3><p>Your sensors can report incidents without response outputs. Add an output when you want to test a coordinated response, then return here to set its permission.</p>{onAddOutput && <button className="primary" onClick={onAddOutput}>Add a response output</button>}</div> : <>
    {!loaded && <p role="status">{error ? 'Saved permissions could not be loaded. Retry before making changes.' : 'Loading saved permissions…'}</p>}
    {outputs.slice((currentPage - 1) * 10, currentPage * 10).map(device => <fieldset key={device.id}><legend>{device.name} · {catalog.locations.find(location => location.id === device.location_id)?.name}</legend>
      <p>{deviceTypes[device.type]?.label}{device.room ? ' · ' + device.room : ' · No room specified'}</p>
      {!device.enabled && <p className="notice">This output is disabled in Devices. Enable it there before configuring a response.</p>}
      <label className="permission-mode">Response mode<select disabled={busy || !loaded || !device.enabled} value={!devices[device.id]?.enabled ? 'off' : device.type !== 'water_valve' && devices[device.id]?.preauthorized ? 'automatic' : 'confirm'} onChange={event => { const mode = event.target.value; change(device.id, { enabled: mode !== 'off', preauthorized: mode === 'automatic' }); }}><option value="off">Off — do not respond</option>{device.type === 'water_valve' ? <option value="confirm">Ask for my approval</option> : <><option value="confirm">Enabled, but not authorized to act</option><option value="automatic">Allow automatic response</option></>}</select></label>
      {device.type === 'water_valve' && <small>Closing a valve always requires your confirmation.</small>}
      <details><summary>Simulation options</summary><label><input type="checkbox" disabled={busy || !loaded || !device.enabled} checked={devices[device.id]?.fail_next || false} onChange={event => change(device.id, { fail_next: event.target.checked })}/>Simulate a failure on the next action</label></details>
    </fieldset>)}
    {outputs.length > 10 && <div className="actions"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {Math.ceil(outputs.length / 10)}</span><button disabled={currentPage * 10 >= outputs.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
    <div className="actions">{dirty && <button className="primary" disabled={busy || !revision} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>}<button disabled={busy} onClick={load}>{dirty ? 'Discard changes and reload' : error ? 'Retry loading permissions' : 'Refresh saved permissions'}</button></div>
    {loaded && !dirty && !message && <p className="form-help">Showing saved permissions. Choose a different mode to make a change.</p>}
    {dirty && <p role="status">You have unsaved permission changes.</p>}
    </>}
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status" className="notice">{message}</p>}
  </section>;
}
