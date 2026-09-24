import React, { useMemo, useState } from 'react';
import { deviceTypes } from './devices';

const emptyLocation = () => ({ id: crypto.randomUUID(), name: '', address: '' });
const emptyDevice = location => ({ id: crypto.randomUUID(), location_id: location || '', name: '', room: '', type: 'smoke_detector', connection: 'simulation', enabled: true });

export default function Settings({ catalog, save, reload, busy, ready, navigate }) {
  const [location, setLocation] = useState(emptyLocation);
  const [device, setDevice] = useState(() => emptyDevice(catalog.locations[0]?.id));
  const [message, setMessage] = useState('');
  const [deletion, setDeletion] = useState(null);
  const [query, setQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const visibleDevices = useMemo(() => catalog.devices.filter(item => {
    const locationName = catalog.locations.find(location => location.id === item.location_id)?.name || '';
    const haystack = `${item.name} ${item.room} ${item.type} ${locationName}`.toLowerCase();
    return (!locationFilter || item.location_id === locationFilter) && haystack.includes(query.trim().toLowerCase());
  }), [catalog.devices, catalog.locations, locationFilter, query]);
  async function persist(next, done) {
    setMessage('');
    try { await save(next); done?.(); setMessage('Settings saved.'); }
    catch (error) { setMessage(error.message); }
  }
  const field = (setter, key) => event => setter(old => ({ ...old, [key]: event.target.value }));
  return <>
    <section className="card"><div className="row"><div><h2>Settings</h2><p>{catalog.locations.length} / 50 locations · {catalog.devices.length} / 200 devices</p></div><button disabled={busy} onClick={() => reload().catch(e => setMessage(e.message))}>Reload settings</button></div>
      <p>Set up locations and simulated devices before an incident. Saved devices are available in Simulation Studio. Use fictional addresses in this shared prototype.</p>
      {message && <p role="status" className="notice">{message}</p>}
      {!ready && <p>Settings are not loaded yet. Reload before making changes.</p>}
    </section>
    <div className="columns settings-columns">
      <section className="card"><h2>Locations</h2>
        {catalog.locations.length === 0 && <p>Add your first location to start adding devices.</p>}
        {catalog.locations.map(item => <article className="catalog-item" key={item.id}><h3>{item.name}</h3><p>{item.address || 'No address added'}</p><div className="actions"><button disabled={busy} onClick={() => setLocation({ ...item })}>Edit <span className="sr-only">{item.name}</span></button><button disabled={busy} onClick={() => setDeletion({ type: 'location', item })}>Delete <span className="sr-only">{item.name}</span></button></div></article>)}
        <form onSubmit={event => { event.preventDefault(); persist({ ...catalog, locations: [...catalog.locations.filter(x => x.id !== location.id), location] }, () => setLocation(emptyLocation())); }}>
          <fieldset disabled={busy || !ready}><legend>{catalog.locations.some(x => x.id === location.id) ? 'Edit location' : 'Add location'}</legend>
            <label>Name<input required maxLength={80} value={location.name} onChange={field(setLocation, 'name')} placeholder="Lakeside apartment"/></label>
            <label>Address (optional)<input maxLength={240} value={location.address} onChange={field(setLocation, 'address')}/></label>
            <div className="actions"><button className="primary">Save location</button><button type="button" onClick={() => setLocation(emptyLocation())}>Clear form</button></div>
          </fieldset>
        </form>
      </section>
      <section className="card"><div className="row"><div><h2>Device inventory</h2><p>{visibleDevices.length} of {catalog.devices.length} devices shown</p></div></div>
        <div className="form-grid"><label>Find a device<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, room or type"/></label><label>Location<select value={locationFilter} onChange={event => setLocationFilter(event.target.value)}><option value="">All locations</option>{catalog.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div>
        {!visibleDevices.length && <p>No devices match this view. Clear the filters or add a simulated device.</p>}
        {visibleDevices.map(item => <article className="catalog-item" key={item.id}><h3>{item.name} <span className="badge">{item.enabled ? 'Enabled' : 'Disabled'}</span></h3><p>{catalog.locations.find(x => x.id === item.location_id)?.name} · {item.room || 'Unspecified room'} · {deviceTypes[item.type]?.label}</p><div className="actions"><button disabled={busy} onClick={() => setDevice({ ...item })}>Edit <span className="sr-only">{item.name}</span></button><button disabled={busy} onClick={() => persist({ ...catalog, devices: [...catalog.devices, { ...item, id: crypto.randomUUID(), name: (item.name.slice(0, 70) + ' (copy)') }] })}>Duplicate <span className="sr-only">{item.name}</span></button><button disabled={busy} onClick={() => setDeletion({ type: 'device', item })}>Delete <span className="sr-only">{item.name}</span></button></div></article>)}
        <details open={catalog.devices.some(x => x.id === device.id)} className="device-editor"><summary>{catalog.devices.some(x => x.id === device.id) ? `Editing ${device.name || 'device'}` : 'Add a simulated device'}</summary>
        <form onSubmit={event => { event.preventDefault(); persist({ ...catalog, devices: [...catalog.devices.filter(x => x.id !== device.id), device] }, () => setDevice(emptyDevice(device.location_id))); }}>
          <fieldset disabled={busy || !ready || !catalog.locations.length}><legend>{catalog.devices.some(x => x.id === device.id) ? 'Edit device' : 'Add device'}</legend>
            <label>Location<select required value={device.location_id} onChange={field(setDevice, 'location_id')}><option value="">Choose a location</option>{catalog.locations.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label>Name<input required maxLength={80} value={device.name} onChange={field(setDevice, 'name')} placeholder="Kitchen smoke detector"/></label>
            <label>Room / area<input maxLength={80} value={device.room} onChange={field(setDevice, 'room')} placeholder="Ground floor · Kitchen"/></label>
            <label>Device type<select value={device.type} onChange={field(setDevice, 'type')}>{Object.entries(deviceTypes).map(([id, type]) => <option key={id} value={id}>{type.label}</option>)}</select></label>
            <label>Connection<select value={device.connection} onChange={field(setDevice, 'connection')}><option value="simulation">Simulation</option><option disabled>Alexa / smart-home integration — unavailable</option><option disabled>Ring integration — unavailable</option><option disabled>MQTT / webhook integration — unavailable</option></select></label>
            <label><input type="checkbox" checked={device.enabled} onChange={event => setDevice(old => ({ ...old, enabled: event.target.checked }))}/>Enabled for simulation</label>
            <div className="actions"><button className="primary">Save device</button><button type="button" onClick={() => setDevice(emptyDevice(device.location_id))}>Clear form</button></div>
          </fieldset>
        </form></details>
      </section>
    </div>
    {deletion && <section className="card" role="region" aria-label="Confirm deletion"><h2>Delete {deletion.item.name}?</h2><p>Removes this saved {deletion.type}. Historical incident evidence remains. A location must have no devices before deletion.</p><div className="actions"><button disabled={busy || (deletion.type === 'location' && catalog.devices.some(x => x.location_id === deletion.item.id))} onClick={() => persist({ ...catalog, [deletion.type === 'location' ? 'locations' : 'devices']: catalog[deletion.type === 'location' ? 'locations' : 'devices'].filter(x => x.id !== deletion.item.id) }, () => { setDeletion(null); setLocation(emptyLocation()); setDevice(emptyDevice()); })}>Confirm deletion</button><button disabled={busy} onClick={() => setDeletion(null)}>Cancel</button></div></section>}
    <button onClick={() => navigate('simulation-lab')}>Open Simulation Studio</button>
  </>;
}
