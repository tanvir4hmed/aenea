import React, { useEffect, useMemo, useRef, useState } from 'react';
import { deviceTypes, signalPriority } from './devices';

const emptyLocation = () => ({ id: crypto.randomUUID(), name: '', address: '' });
const emptyDevice = location => ({ id: crypto.randomUUID(), location_id: location || '', name: '', room: '', type: 'smoke_detector', connection: 'simulation', enabled: true });

export default function Settings({ catalog, save, reload, busy, ready, permissions, cleanup, initialTab = 'locations' }) {
  const [tab, setTab] = useState(initialTab);
  const [devicePage, setDevicePage] = useState(1);
  const [locationPage, setLocationPage] = useState(1);
  const [visited, setVisited] = useState(['locations', initialTab]);
  const [location, setLocation] = useState(emptyLocation);
  const [device, setDevice] = useState(() => emptyDevice(catalog.locations[0]?.id));
  const [message, setMessage] = useState('');
  const [deletion, setDeletion] = useState(null);
  const [query, setQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const editor = useRef(null);
  const deviceName = useRef(null);
  useEffect(() => { setTab(initialTab); setVisited(old => old.includes(initialTab) ? old : [...old, initialTab]); }, [initialTab]);
  function selectTab(id) { setTab(id); setVisited(old => old.includes(id) ? old : [...old, id]); }
  function addOutput() {
    if (!catalog.locations.length) { selectTab('locations'); setMessage('Add a location first, then add a response output to that location.'); return; }
    selectTab('devices'); setDevice({ ...emptyDevice(catalog.locations[0].id), type: 'notification' }); setEditorOpen(true);
    requestAnimationFrame(() => { editor.current?.scrollIntoView({ block: 'center' }); deviceName.current?.focus(); });
  }
  const visibleDevices = useMemo(() => catalog.devices.filter(item => {
    const locationName = catalog.locations.find(location => location.id === item.location_id)?.name || '';
    const haystack = `${item.name} ${item.room} ${item.type} ${locationName}`.toLowerCase();
    return (!locationFilter || item.location_id === locationFilter) && haystack.includes(query.trim().toLowerCase());
  }), [catalog.devices, catalog.locations, locationFilter, query]);
  const locations = catalog.locations;
  const page = Math.min(devicePage, Math.max(1, Math.ceil(visibleDevices.length / 10)));
  const locPage = Math.min(locationPage, Math.max(1, Math.ceil(locations.length / 10)));
  function pager(current, total, update) {
    if (total <= 10) return null;
    return <div className="actions" aria-label="Pagination"><button disabled={current <= 1} onClick={() => update(current - 1)}>Previous</button><span>Page {current} of {Math.max(1, Math.ceil(total / 10))} · {total} items</span><button disabled={current * 10 >= total} onClick={() => update(current + 1)}>Next</button></div>;
  }
  async function persist(next, done) {
    setMessage('');
    try { await save(next); done?.(); setMessage('Settings saved.'); }
    catch (error) { setMessage(error.message); }
  }
  const field = (setter, key) => event => setter(old => ({ ...old, [key]: event.target.value }));
  return <>
    <section className="card settings-overview"><div className="row"><div><h2>Your household setup</h2><p>{catalog.locations.length} locations · {catalog.devices.length} devices</p></div><button disabled={busy} onClick={() => reload().catch(e => setMessage(e.message))}>Reload settings</button></div>
      <p>Manage your places, devices and response preferences.</p>
      {message && <p role="status" className="notice">{message}</p>}
      {!ready && <p>Settings are not loaded yet. Reload before making changes.</p>}
    </section>
    <div className="view-tabs" aria-label="Settings sections">{[['locations', 'Locations'], ['devices', 'Devices'], ['permissions', 'Response permissions'], ['cleanup', 'Data & cleanup']].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => selectTab(id)}>{label}</button>)}</div>
    <div className="settings-panels">
      <section className="card" hidden={tab !== 'locations'}>
        <form className="settings-form" onSubmit={event => { event.preventDefault(); persist({ ...catalog, locations: [...catalog.locations.filter(x => x.id !== location.id), location] }, () => setLocation(emptyLocation())); }}>
          <fieldset disabled={busy || !ready}><legend>{catalog.locations.some(x => x.id === location.id) ? 'Edit location' : 'Add location'}</legend>
            <div className="form-grid"><label>Location name<input required maxLength={80} value={location.name} onChange={field(setLocation, 'name')} placeholder="Lakeside apartment"/></label>
            <label>Address (optional)<input maxLength={240} value={location.address} onChange={field(setLocation, 'address')}/></label></div>
            <div className="actions"><button className="primary">Save location</button><button type="button" onClick={() => setLocation(emptyLocation())}>Clear form</button></div>
          </fieldset>
        </form>
        <div className="saved-locations"><h3>Saved locations · {locations.length}</h3>
        {catalog.locations.length === 0 && <p>Add your first location to start adding devices.</p>}
        {locations.slice((locPage - 1) * 10, locPage * 10).map(item => <article className="catalog-item" key={item.id}><h3>{item.name}</h3><p>{item.address || 'No address added'}</p><div className="actions"><button disabled={busy} onClick={() => setLocation({ ...item })}>Edit <span className="sr-only">{item.name}</span></button><button disabled={busy} onClick={() => setDeletion({ type: 'location', item })}>Delete <span className="sr-only">{item.name}</span></button></div></article>)}
        {pager(locPage, locations.length, setLocationPage)}

        </div>
      </section>
      <section className="card" hidden={tab !== 'devices'}><div className="row"><div><h2>Device inventory</h2><p>{visibleDevices.length} of {catalog.devices.length} devices shown</p></div></div>
        <p>Input sensors report signals. Response outputs perform simulated actions only after you configure their response permissions.</p>
        <div className="actions"><button disabled={busy || !ready} onClick={addOutput}>Add a response output</button><button onClick={() => selectTab('permissions')}>Configure response permissions</button></div>
        <div className="form-grid"><label>Find a device<input value={query} onChange={event => { setQuery(event.target.value); setDevicePage(1); }} placeholder="Name, room or type"/></label><label>Location<select value={locationFilter} onChange={event => { setLocationFilter(event.target.value); setDevicePage(1); }}><option value="">All locations</option>{catalog.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div>
        {!visibleDevices.length && <p>No devices match this view. Clear the filters or add a simulated device.</p>}
        {visibleDevices.slice((page - 1) * 10, page * 10).map(item => <article className="catalog-item" key={item.id}><h3>{item.name} <span className="badge">{item.enabled ? 'Enabled' : 'Disabled'}</span></h3><p>{catalog.locations.find(x => x.id === item.location_id)?.name} · {item.room || 'Unspecified room'} · {deviceTypes[item.type]?.label}</p>{deviceTypes[item.type]?.kinds.length > 0 && <small>Default priority: {signalPriority(deviceTypes[item.type].kinds[0])}</small>}<div className="actions"><button disabled={busy} onClick={() => setDevice({ ...item })}>Edit <span className="sr-only">{item.name}</span></button><button disabled={busy} onClick={() => persist({ ...catalog, devices: [...catalog.devices, { ...item, id: crypto.randomUUID(), name: (item.name.slice(0, 70) + ' (copy)') }] })}>Duplicate <span className="sr-only">{item.name}</span></button><button disabled={busy} onClick={() => setDeletion({ type: 'device', item })}>Delete <span className="sr-only">{item.name}</span></button></div></article>)}
        {pager(page, visibleDevices.length, setDevicePage)}
        <details ref={editor} open={editorOpen || catalog.devices.some(x => x.id === device.id)} onToggle={event => setEditorOpen(event.currentTarget.open)} className="device-editor"><summary>{catalog.devices.some(x => x.id === device.id) ? `Editing ${device.name || 'device'}` : 'Add a simulated device'}</summary>
        <form onSubmit={event => { event.preventDefault(); persist({ ...catalog, devices: [...catalog.devices.filter(x => x.id !== device.id), device] }, () => setDevice(emptyDevice(device.location_id))); }}>
          <fieldset className="settings-form" disabled={busy || !ready || !catalog.locations.length}><legend>{catalog.devices.some(x => x.id === device.id) ? 'Edit device' : 'Add device'}</legend>
            <label>Location<select required value={device.location_id} onChange={field(setDevice, 'location_id')}><option value="">Choose a location</option>{catalog.locations.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label>Name<input ref={deviceName} required maxLength={80} value={device.name} onChange={field(setDevice, 'name')} placeholder={deviceTypes[device.type]?.category === 'actuator' ? 'Kitchen response light' : 'Kitchen smoke detector'}/></label>
            <label>Room / area (optional)<input maxLength={80} value={device.room} onChange={field(setDevice, 'room')} placeholder="Ground floor · Kitchen"/></label>
            <label>Device type<select value={device.type} onChange={field(setDevice, 'type')}><optgroup label="Input sensors — report signals">{Object.entries(deviceTypes).filter(([, type]) => type.category !== 'actuator').map(([id, type]) => <option key={id} value={id}>{type.label}</option>)}</optgroup><optgroup label="Response outputs — perform simulated actions">{Object.entries(deviceTypes).filter(([, type]) => type.category === 'actuator').map(([id, type]) => <option key={id} value={id}>{type.label}</option>)}</optgroup></select></label>
            {deviceTypes[device.type]?.category === 'actuator' && <p>After saving this output, open Response permissions to allow its actions. Adding it does not authorize a response.</p>}
            <label>Connection<select value={device.connection} onChange={field(setDevice, 'connection')}><option value="simulation">Simulation</option><option disabled>Alexa / smart-home integration — unavailable</option><option disabled>Ring integration — unavailable</option><option disabled>MQTT / webhook integration — unavailable</option></select></label>
            <label><input type="checkbox" checked={device.enabled} onChange={event => setDevice(old => ({ ...old, enabled: event.target.checked }))}/>Enabled for simulation</label>
            <div className="actions"><button className="primary">Save device</button><button type="button" onClick={() => setDevice(emptyDevice(device.location_id))}>Clear form</button></div>
          </fieldset>
        </form></details>
      </section>
    </div>
    <div hidden={tab !== 'permissions'}>{visited.includes('permissions') && (React.isValidElement(permissions) ? React.cloneElement(permissions, { onAddOutput: addOutput }) : permissions)}</div>
    <div hidden={tab !== 'cleanup'}>{visited.includes('cleanup') && cleanup}</div>
    {deletion && <section className="card" role="region" aria-label="Confirm deletion"><h2>Delete {deletion.item.name}?</h2><p>Removes this saved {deletion.type}. Historical incident evidence remains. A location must have no devices before deletion.</p><div className="actions"><button disabled={busy || (deletion.type === 'location' && catalog.devices.some(x => x.location_id === deletion.item.id))} onClick={() => persist({ ...catalog, [deletion.type === 'location' ? 'locations' : 'devices']: catalog[deletion.type === 'location' ? 'locations' : 'devices'].filter(x => x.id !== deletion.item.id) }, () => { setDeletion(null); setLocation(emptyLocation()); setDevice(emptyDevice()); })}>Confirm deletion</button><button disabled={busy} onClick={() => setDeletion(null)}>Cancel</button></div></section>}
  </>;
}
