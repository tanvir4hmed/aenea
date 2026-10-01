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
  return <section className="card"><h2>Location action permissions</h2>
    {!outputs.length && <p>Add virtual lights, sirens, notifications or a valve in the Devices tab, then configure permissions here.</p>}
    {outputs.slice((currentPage - 1) * 10, currentPage * 10).map(device => <fieldset key={device.id}><legend>{device.name} · {catalog.locations.find(location => location.id === device.location_id)?.name}</legend>
      {['enabled', ...(device.type === 'water_valve' ? [] : ['preauthorized']), 'fail_next'].map(field => <label key={field}><input type="checkbox" disabled={busy} checked={devices[device.id]?.[field] || false} onChange={event => setDevices(old => ({ ...old, [device.id]: { ...old[device.id], [field]: event.target.checked } }))}/>{field === 'enabled' ? 'Allow simulated actions' : field === 'preauthorized' ? 'Allow automatic action' : 'Fail next simulated action'}</label>)}
    </fieldset>)}
    {outputs.length > 10 && <div className="actions"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {Math.ceil(outputs.length / 10)}</span><button disabled={currentPage * 10 >= outputs.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
    <div className="actions"><button disabled={busy || !outputs.length || !revision} onClick={async () => { setBusy(true); try { await api('/household/devices', { method: 'PUT', body: JSON.stringify({ revision, devices: Object.fromEntries(outputs.map(device => [device.id, Object.fromEntries(['enabled', 'preauthorized', 'fail_next'].map(field => [field, Boolean(devices[device.id]?.[field])]))])) }) }); await load(); setMessage('Permissions saved. Valve closure still requires explicit confirmation.'); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }}>Save permissions</button><button disabled={busy} onClick={() => load().catch(error => setMessage(error.message))}>Reload</button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
