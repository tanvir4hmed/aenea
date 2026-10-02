import React, { useEffect, useMemo, useState } from 'react';
import { deviceTypes } from './devices';

const preference = 'aenea-last-location';
const blankLocation = () => ({ id: crypto.randomUUID(), name: '', address: '' });
const blankDevice = site => ({ id: crypto.randomUUID(), location_id: site || '', name: '', room: '', type: 'smoke_detector', connection: 'simulation', enabled: true });
function preferredLocation(catalog) {
  let saved;
  try { saved = sessionStorage.getItem(preference); } catch { /* Optional preference. */ }
  return catalog.locations.find(item => item.id === saved)?.id || catalog.locations[0]?.id || '';
}

export default function Settings({ catalog, save, reload, busy, ready, cleanup, initialTab = 'devices' }) {
  const [tab, setTab] = useState(initialTab === 'cleanup' ? 'cleanup' : 'devices');
  const [device, setDevice] = useState(() => blankDevice(preferredLocation(catalog)));
  const [location, setLocation] = useState(blankLocation), [newLocation, setNewLocation] = useState(blankLocation);
  const [creatingLocation, setCreatingLocation] = useState(false), [manageLocations, setManageLocations] = useState(initialTab === 'locations');
  const [selectedLocation, setSelectedLocation] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const [message, setMessage] = useState(''), [failure, setFailure] = useState(''), [deletion, setDeletion] = useState(null);
  useEffect(() => { setTab(initialTab === 'cleanup' ? 'cleanup' : 'devices'); if (initialTab === 'locations') setManageLocations(true); }, [initialTab]);
  useEffect(() => {
    if (!ready) return;
    if (!catalog.locations.some(item => item.id === device.location_id)) setDevice(old => ({ ...old, location_id: preferredLocation(catalog) }));
    if (selectedLocation && !catalog.locations.some(item => item.id === selectedLocation)) setSelectedLocation('');
  }, [catalog.revision, ready]);
  const visible = useMemo(() => catalog.devices.filter(item => (!selectedLocation || item.location_id === selectedLocation) && `${item.name} ${item.room} ${deviceTypes[item.type]?.label || item.type}`.toLowerCase().includes(query.trim().toLowerCase())), [catalog.devices, selectedLocation, query]);
  const pages = Math.max(1, Math.ceil(visible.length / 10)), currentPage = Math.min(page, pages);
  const editing = catalog.devices.some(item => item.id === device.id);
  function remember(id) { try { sessionStorage.setItem(preference, id); } catch { /* Optional preference. */ } }
  function addDevice() { setDevice(blankDevice(selectedLocation || preferredLocation(catalog))); setCreatingLocation(false); setNewLocation(blankLocation()); setTab('add'); setFailure(''); setMessage(''); }
  async function persist(next, done, success = 'Saved.') {
    setMessage(''); setFailure('');
    try { await save(next); done?.(); setMessage(success); }
    catch (error) { setFailure(error.message); }
  }
  const field = (setter, key) => event => setter(old => ({ ...old, [key]: event.target.value }));
  function submitDevice(event) {
    event.preventDefault();
    const create = creatingLocation || !catalog.locations.length, site = create ? newLocation.id : device.location_id;
    const next = { ...catalog, locations: create ? [...catalog.locations, { ...newLocation, name: newLocation.name.trim(), address: newLocation.address.trim() }] : catalog.locations,
      devices: [...catalog.devices.filter(item => item.id !== device.id), { ...device, location_id: site, name: device.name.trim(), room: device.room.trim() }] };
    persist(next, () => { remember(site); setSelectedLocation(site); setDevice(blankDevice(site)); setNewLocation(blankLocation()); setCreatingLocation(false); setTab('devices'); setQuery(''); setPage(1); }, editing ? 'Device updated.' : 'Device added.');
  }
  return <div className="settings-workspace">
    <section className="card settings-toolbar"><div className="row"><div><h2>Your devices</h2><p>{catalog.devices.length} devices · {catalog.locations.length} locations</p></div><button disabled={busy} onClick={() => reload().catch(error => setFailure(error.message))}>Refresh</button></div>
      <div className="settings-location-row"><label>Location<select value={selectedLocation} disabled={!ready || busy} onChange={event => { setSelectedLocation(event.target.value); setPage(1); if (event.target.value) remember(event.target.value); }}><option value="">All locations</option>{catalog.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button aria-expanded={manageLocations} onClick={() => setManageLocations(value => !value)}>Manage locations</button></div>
      {manageLocations && <div className="location-manager"><form onSubmit={event => { event.preventDefault(); persist({ ...catalog, locations: [...catalog.locations.filter(item => item.id !== location.id), { ...location, name: location.name.trim(), address: location.address.trim() }] }, () => { remember(location.id); setSelectedLocation(location.id); setLocation(blankLocation()); }, 'Location saved.'); }}>
        <fieldset disabled={busy || !ready}><legend>{catalog.locations.some(item => item.id === location.id) ? 'Edit location' : 'New location'}</legend><div className="form-grid"><label>Name<input required maxLength={80} placeholder="My home" value={location.name} onChange={field(setLocation, 'name')}/></label><label>Address <small>optional</small><input maxLength={240} value={location.address} onChange={field(setLocation, 'address')}/></label></div><div className="actions"><button className="primary">Save location</button>{catalog.locations.some(item => item.id === location.id) && <button type="button" onClick={() => setLocation(blankLocation())}>Cancel edit</button>}</div></fieldset>
      </form><div className="location-list">{catalog.locations.map(item => <div className="location-row" key={item.id}><div><strong>{item.name}</strong>{item.address && <small>{item.address}</small>}</div><div className="actions"><button disabled={busy} onClick={() => setLocation({ ...item })} aria-label={'Edit location ' + item.name}>Edit</button><button disabled={busy} onClick={() => setDeletion({ type: 'location', item })} aria-label={'Delete location ' + item.name}>Delete</button></div></div>)}</div></div>}
    </section>
    {message && <p className="notice" role="status">{message}</p>}{failure && <p className="error" role="alert">{failure}</p>}{!ready && <p role="status">Loading devices…</p>}
    <nav className="view-tabs" aria-label="Settings sections"><button aria-current={tab === 'devices' ? 'page' : undefined} onClick={() => setTab('devices')}>Device list</button><button aria-current={tab === 'add' ? 'page' : undefined} onClick={addDevice}>{tab === 'add' && editing ? 'Edit device' : 'Add device'}</button><button aria-current={tab === 'cleanup' ? 'page' : undefined} onClick={() => setTab('cleanup')}>Data & cleanup</button></nav>
    {tab === 'devices' && <section className="card device-inventory">
      {!!catalog.devices.length && <label className="device-search">Find a device<input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Name, room or type"/></label>}
      {!visible.length && <div className="empty-state"><h2>{catalog.devices.length ? 'No matching devices' : 'Add your first device'}</h2><p>{catalog.devices.length ? 'Try another location or search.' : 'Choose its type and location. You can create a location as you go.'}</p><button className="primary" disabled={!ready || busy} onClick={addDevice}>Add device</button></div>}
      {visible.slice((currentPage - 1) * 10, currentPage * 10).map(item => <article className="catalog-item" key={item.id}><div className="row"><div><h3>{item.name}</h3><p>{catalog.locations.find(site => site.id === item.location_id)?.name} · {item.room || 'No room set'} · {deviceTypes[item.type]?.label}</p><span className="badge">{deviceTypes[item.type]?.category === 'actuator' ? 'Legacy output · inactive' : item.enabled ? 'Enabled' : 'Disabled'}</span></div><div className="actions"><button disabled={busy} onClick={() => { setDevice({ ...item }); setCreatingLocation(false); setTab('add'); }}>Edit <span className="sr-only">{item.name}</span></button><button disabled={busy || deviceTypes[item.type]?.category === 'actuator'} onClick={() => { setDevice({ ...item, id: crypto.randomUUID(), name: item.name.slice(0, 70) + ' (copy)' }); setCreatingLocation(false); setTab('add'); }}>Duplicate <span className="sr-only">{item.name}</span></button><button disabled={busy} onClick={() => setDeletion({ type: 'device', item })}>Delete <span className="sr-only">{item.name}</span></button></div></div></article>)}
      {pages > 1 && <nav className="pagination" aria-label="Device pages"><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pages} · {visible.length} devices</span><button disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
    </section>}
    {tab === 'add' && <section className="card"><h2>{editing ? 'Edit device' : 'Add device'}</h2><form className="settings-form" onSubmit={submitDevice}><fieldset disabled={busy || !ready}><div className="form-grid">
      <label>Device name<input required autoFocus maxLength={80} value={device.name} onChange={field(setDevice, 'name')} placeholder="Kitchen smoke detector"/></label><label>Type<select value={device.type} onChange={field(setDevice, 'type')}>{deviceTypes[device.type]?.category === 'actuator' && <option value={device.type}>{deviceTypes[device.type].label} · legacy</option>}{Object.entries(deviceTypes).filter(([, type]) => type.category !== 'actuator').map(([id, type]) => <option key={id} value={id}>{type.label}</option>)}</select></label>
      <label>Location<select required value={creatingLocation || !catalog.locations.length ? '__new__' : device.location_id} onChange={event => { const id = event.target.value; setCreatingLocation(id === '__new__'); if (id !== '__new__') { setDevice(old => ({ ...old, location_id: id })); remember(id); } }}>{catalog.locations.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}<option value="__new__">+ Create new location</option></select></label><label>Room / area <small>optional</small><input maxLength={80} value={device.room} onChange={field(setDevice, 'room')} placeholder="Ground floor · Kitchen"/></label></div>
      {(creatingLocation || !catalog.locations.length) && <div className="inline-location form-grid"><label>New location name<input required maxLength={80} value={newLocation.name} onChange={field(setNewLocation, 'name')} placeholder="My home"/></label><label>Address <small>optional</small><input maxLength={240} value={newLocation.address} onChange={field(setNewLocation, 'address')}/></label></div>}
      <div className="form-grid"><label>Connection<select value={device.connection} onChange={field(setDevice, 'connection')}><option value="simulation">Simulation</option><option disabled>Real device integration · unavailable</option></select></label><label className="device-enabled"><input type="checkbox" checked={device.enabled} onChange={event => setDevice(old => ({ ...old, enabled: event.target.checked }))}/>Enabled</label></div>
      <div className="actions"><button className="primary">{busy ? 'Saving…' : editing ? 'Save changes' : 'Add device'}</button><button type="button" onClick={() => setTab('devices')}>Cancel</button></div>
    </fieldset></form></section>}
    {tab === 'cleanup' && cleanup}
    {deletion && <section className="card delete-confirmation" role="region" aria-label="Confirm deletion"><h2>Delete {deletion.item.name}?</h2><p>{deletion.type === 'location' ? 'Move or delete devices at this location first.' : 'Saved simulations using this device will need editing before they can run again. Past incident evidence is retained.'}</p><div className="actions"><button disabled={busy || (deletion.type === 'location' && catalog.devices.some(item => item.location_id === deletion.item.id))} onClick={() => persist({ ...catalog, [deletion.type === 'location' ? 'locations' : 'devices']: catalog[deletion.type === 'location' ? 'locations' : 'devices'].filter(item => item.id !== deletion.item.id) }, () => { setDeletion(null); setDevice(blankDevice(preferredLocation(catalog))); setLocation(blankLocation()); }, 'Deleted.')}>Delete {deletion.type}</button><button disabled={busy} onClick={() => setDeletion(null)}>Cancel</button></div></section>}
  </div>;
}
