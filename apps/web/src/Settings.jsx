import React, { useEffect, useMemo, useState } from 'react';
import { deviceTypes } from './devices';
import { house, floors, houseRooms, isMapleHouse, furnishedCatalog } from './house';

const blankDevice = () => ({ id: crypto.randomUUID(), location_id: house.id, name: '', room: '', type: 'smoke_detector', connection: 'simulation', enabled: true });

export default function Settings({ catalog, save, reload, busy, ready, cleanup, initialTab = 'devices' }) {
  const [tab, setTab] = useState(initialTab === 'cleanup' ? 'cleanup' : 'devices');
  const [device, setDevice] = useState(blankDevice);
  const [query, setQuery] = useState(''), [room, setRoom] = useState(''), [page, setPage] = useState(1);
  const [message, setMessage] = useState(''), [failure, setFailure] = useState(''), [deletion, setDeletion] = useState(null);
  useEffect(() => { setTab(initialTab === 'cleanup' ? 'cleanup' : 'devices'); }, [initialTab]);
  const fixed = isMapleHouse(catalog);
  const visible = useMemo(() => catalog.devices.filter(item => (!room || item.room === room) && `${item.name} ${item.room} ${deviceTypes[item.type]?.label || item.type}`.toLowerCase().includes(query.trim().toLowerCase())), [catalog.devices, room, query]);
  const pages = Math.max(1, Math.ceil(visible.length / 10)), currentPage = Math.min(page, pages);
  const editing = catalog.devices.some(item => item.id === device.id);
  function addDevice() { setDevice(blankDevice()); setTab('add'); setFailure(''); setMessage(''); }
  async function persist(next, done, success = 'Saved.') {
    setMessage(''); setFailure('');
    try { await save(next); done?.(); setMessage(success); }
    catch (error) { setFailure(error.message); }
  }
  function choose(key, value) {
    setDevice(old => {
      const next = { ...old, [key]: value };
      const previousDefault = `${old.room} · ${deviceTypes[old.type]?.label}`;
      if (key !== 'name' && (!old.name || old.name === previousDefault)) next.name = next.room ? `${next.room} · ${deviceTypes[next.type]?.label}` : '';
      return next;
    });
  }
  function submitDevice(event) {
    event.preventDefault();
    if (!fixed || !houseRooms.includes(device.room)) return;
    persist({ ...catalog, devices: [...catalog.devices.filter(item => item.id !== device.id), { ...device, location_id: house.id, name: device.name.trim() }] }, () => { setDevice(blankDevice()); setTab('devices'); setQuery(''); setRoom(''); setPage(1); }, editing ? 'Device updated.' : 'Device added.');
  }
  return <div className="settings-workspace">
    <section className="card settings-toolbar"><div className="row"><div><h2>{house.name} devices</h2><p>Three-bedroom duplex · {houseRooms.length} fixed rooms and areas · {catalog.devices.length} devices</p></div><button disabled={busy} onClick={() => reload().catch(error => setFailure(error.message))}>Refresh</button></div><p>Choose a room, add a device, then create its simulation. The furnished house layout is already set.</p></section>
    {ready && !fixed && <section className="card" aria-label="Existing setup review"><h2>Existing setup — review before fresh start</h2><p>Your saved setup has not been changed. Maple House is ready with {furnishedCatalog().devices.length} simulated devices. Review the existing locations and devices below before approving replacement.</p>
      {catalog.locations.map(site => <details key={site.id} open><summary>{site.name} · {catalog.devices.filter(item => item.location_id === site.id).length} devices</summary><ul>{catalog.devices.filter(item => item.location_id === site.id).map(item => <li key={item.id}>{item.room || 'No room'} — {item.name} ({deviceTypes[item.type]?.label || item.type})</li>)}</ul></details>)}
      <p>The previous setup is awaiting the administrator's fresh reset. Existing incidents, saved simulations and cloud runs have not been deleted yet.</p>
    </section>}
    {message && <p className="notice" role="status">{message}</p>}{failure && <p className="error" role="alert">{failure}</p>}{!ready && <p role="status">Loading devices…</p>}
    <nav className="view-tabs" aria-label="Settings sections"><button aria-current={tab === 'devices' ? 'page' : undefined} onClick={() => setTab('devices')}>Device list</button><button disabled={!ready || !fixed || busy} aria-current={tab === 'add' ? 'page' : undefined} onClick={addDevice}>{tab === 'add' && editing ? 'Edit device' : 'Add device'}</button><button aria-current={tab === 'cleanup' ? 'page' : undefined} onClick={() => setTab('cleanup')}>Data & cleanup</button></nav>
    {tab === 'devices' && <section className="card device-inventory">
      <div className="form-grid"><label>Find a device<input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Name, room or type"/></label><label>Room / area<select value={room} onChange={event => { setRoom(event.target.value); setPage(1); }}><option value="">All rooms and areas</option>{floors.map(floor => <optgroup key={floor.name} label={floor.name}>{floor.rooms.map(name => <option key={name}>{name}</option>)}</optgroup>)}</select></label></div>
      {!visible.length && <div className="empty-state"><h2>No matching devices</h2><p>Choose another room, clear your search, or add a device to an existing room.</p></div>}
      {visible.slice((currentPage - 1) * 10, currentPage * 10).map(item => <article className="catalog-item" key={item.id}><div className="row"><div><h3>{item.name}</h3><p>{item.room || 'No room set'} · {deviceTypes[item.type]?.label}</p><span className="badge">{deviceTypes[item.type]?.category === 'actuator' ? 'Legacy output · inactive' : item.enabled ? 'Enabled' : 'Disabled'}</span></div><div className="actions"><button disabled={busy || !fixed} onClick={() => { setDevice({ ...item }); setTab('add'); }}>Edit <span className="sr-only">{item.name}</span></button><button disabled={busy || !fixed || deviceTypes[item.type]?.category === 'actuator'} onClick={() => { setDevice({ ...item, id: crypto.randomUUID(), name: item.name.slice(0, 70) + ' (copy)' }); setTab('add'); }}>Duplicate <span className="sr-only">{item.name}</span></button><button disabled={busy || !fixed} onClick={() => setDeletion(item)}>Delete <span className="sr-only">{item.name}</span></button></div></div></article>)}
      {pages > 1 && <nav className="pagination" aria-label="Device pages"><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pages} · {visible.length} devices</span><button disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
    </section>}
    {tab === 'add' && fixed && <section className="card"><h2>{editing ? 'Edit device' : 'Add device'}</h2><form className="settings-form" onSubmit={submitDevice}><fieldset disabled={busy || !ready}><div className="form-grid">
      <label>Room / area<select required autoFocus value={device.room} onChange={event => choose('room', event.target.value)}><option value="" disabled>Choose a room</option>{floors.map(floor => <optgroup key={floor.name} label={floor.name}>{floor.rooms.map(name => <option key={name}>{name}</option>)}</optgroup>)}</select></label>
      <label>Type<select value={device.type} onChange={event => choose('type', event.target.value)}>{deviceTypes[device.type]?.category === 'actuator' && <option value={device.type}>{deviceTypes[device.type].label} · legacy</option>}{Object.entries(deviceTypes).filter(([, type]) => type.category !== 'actuator').map(([id, type]) => <option key={id} value={id}>{type.label}</option>)}</select></label>
      <label>Device name<input required maxLength={80} value={device.name} onChange={event => choose('name', event.target.value)} placeholder="Kitchen · Heat detector"/></label><label>Connection<input readOnly value="Simulation"/></label></div>
      <label className="device-enabled"><input type="checkbox" checked={device.enabled} onChange={event => setDevice(old => ({ ...old, enabled: event.target.checked }))}/>Enabled</label>
      <div className="actions"><button className="primary">{busy ? 'Saving…' : editing ? 'Save changes' : 'Add device'}</button><button type="button" onClick={() => setTab('devices')}>Cancel</button></div>
    </fieldset></form></section>}
    {tab === 'cleanup' && cleanup}
    {deletion && <section className="card delete-confirmation" role="region" aria-label="Confirm deletion"><h2>Delete {deletion.name}?</h2><p>Saved simulations using this device will need editing before they can run again. Past incident evidence is retained. Its room remains in the house.</p><div className="actions"><button disabled={busy} onClick={() => persist({ ...catalog, devices: catalog.devices.filter(item => item.id !== deletion.id) }, () => { setDeletion(null); setDevice(blankDevice()); }, 'Device deleted.')}>Delete device</button><button disabled={busy} onClick={() => setDeletion(null)}>Cancel</button></div></section>}
  </div>;
}
