import React, { useEffect, useState } from 'react';
import { deviceTypes } from './devices';

export default function ActionSettings({ api, catalog }) {
  const [devices, setDevices] = useState({}), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [revision, setRevision] = useState(null);
  const [page, setPage] = useState(1);
  const outputs = catalog.devices.filter(device => deviceTypes[device.type]?.category === 'actuator');
  const currentPage = Math.min(page, Math.max(1, Math.ceil(outputs.length / 10)));
  async function load() { const result = await api('/household/devices'); setDevices(result.devices); setRevision(result.revision); }
  useEffect(() => { load().catch(error => setMessage(error.message)); }, [catalog.revision]);
  return <section className="card"><h2>How Aenea may respond</h2>
    <p>Allow lights, sirens and notifications to respond automatically to an eligible agent decision. A water valve always asks for your approval. Disabled or unauthorized outputs cannot act. These outputs are simulated.</p>
    {!outputs.length && <p>Add virtual lights, sirens, notifications or a valve in the Devices tab, then configure permissions here.</p>}
    {outputs.slice((currentPage - 1) * 10, currentPage * 10).map(device => <fieldset key={device.id}><legend>{device.name} · {catalog.locations.find(location => location.id === device.location_id)?.name}</legend>
      <label className="permission-mode">Response mode<select disabled={busy || !revision} value={!devices[device.id]?.enabled ? 'off' : device.type !== 'water_valve' && devices[device.id]?.preauthorized ? 'automatic' : 'confirm'} onChange={event => { const mode = event.target.value; setDevices(old => ({ ...old, [device.id]: { ...old[device.id], enabled: mode !== 'off', preauthorized: mode === 'automatic' } })); }}><option value="off">Disabled</option><option value="confirm">{device.type === 'water_valve' ? 'Ask for my approval' : 'Not authorized to act'}</option>{device.type !== 'water_valve' && <option value="automatic">Allow automatic response</option>}</select></label>
      {device.type === 'water_valve' && <small>Closing a valve always requires your confirmation.</small>}
      <details><summary>Simulation options</summary><label><input type="checkbox" disabled={busy || !revision} checked={devices[device.id]?.fail_next || false} onChange={event => setDevices(old => ({ ...old, [device.id]: { ...old[device.id], fail_next: event.target.checked } }))}/>Simulate a failure on the next action</label></details>
    </fieldset>)}
    {outputs.length > 10 && <div className="actions"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {Math.ceil(outputs.length / 10)}</span><button disabled={currentPage * 10 >= outputs.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
    <div className="actions"><button disabled={busy || !outputs.length || !revision} onClick={async () => { setBusy(true); try { await api('/household/devices', { method: 'PUT', body: JSON.stringify({ revision, devices: Object.fromEntries(outputs.map(device => [device.id, Object.fromEntries(['enabled', 'preauthorized', 'fail_next'].map(field => [field, Boolean(devices[device.id]?.[field])]))])) }) }); await load(); setMessage('Permissions saved. Valve closure still requires explicit confirmation.'); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }}>Save permissions</button><button disabled={busy} onClick={() => load().catch(error => setMessage(error.message))}>Reload</button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
