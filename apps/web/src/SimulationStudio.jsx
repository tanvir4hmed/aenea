import React, { useEffect, useMemo, useRef, useState } from 'react';
import { deviceTypes, humanize, signalPayload, signalPriority } from './devices';
import { incidentLabel } from './incidentNames';
import { selectedSignals, selectionForDevice } from './simulations';
import SimulationRuns from './SimulationRuns';
import { houseRooms, isMapleHouse } from './house';
import { defaultProfile, supportedKinds, roomInventory, appendRoomSignals, simulationSeverities } from './simulationForm';
import './compact-workspace.css';

const blank = () => ({ id: crypto.randomUUID(), name: '', type: 'single', signals: [], profile: { ...defaultProfile } });

export default function SimulationStudio({ api, household, catalog, ready, selected, incidents, onAccepted, onBusy, navigate, disabled, deviceSelection, embedded = false, map, briefing, active = true }) {
  const [view, setView] = useState('create');
  const [library, setLibrary] = useState({ revision: null, items: [] }), [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(blank), [pickedIds, setPickedIds] = useState([]), [kindByDevice, setKindByDevice] = useState({}), [observation, setObservation] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [severityByDevice, setSeverityByDevice] = useState({});
  const [savedQuery, setSavedQuery] = useState(''), [savedLocation, setSavedLocation] = useState('');
  const [savedRoom, setSavedRoom] = useState(''), [savedDevice, setSavedDevice] = useState(''), [savedType, setSavedType] = useState('');
  const [savedPage, setSavedPage] = useState(1);
  const [selection, setSelection] = useState([]), [target, setTarget] = useState('auto'), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const runKey = 'aenea-trigger-' + household;
  const [run, setRun] = useState(() => { try { return JSON.parse(sessionStorage.getItem(runKey)) || null; } catch { return null; } });
  const lock = useRef(false);
  const [started, setStarted] = useState(null);
  const requestKey = 'aenea-run-request-' + household;
  const [request, setRequest] = useState(() => { try { return JSON.parse(sessionStorage.getItem(requestKey)); } catch { return null; } });
  const pending = run?.rows?.some(row => !row.accepted);
  const mappedDevice = catalog.devices.find(item => item.id === deviceSelection?.id);
  const editing = library.items.some(item => item.id === draft.id);
  const requiredSignals = draft.type === 'single' ? 1 : 2;
  const canSave = draft.name.trim() && draft.signals.length >= requiredSignals;
  async function reload() {
    const value = await api('/household/simulations'); setLibrary(value); setLoaded(true);
  }
  useEffect(() => { reload().catch(e => setError(e.message)); }, [household]);
  useEffect(() => {
    if (!deviceSelection || deviceSelection.inspect) return;
    const item = catalog.devices.find(item => item.id === deviceSelection.id);
    if (!item || !loaded) return;
    const matching = selectionForDevice(library.items, item.id);
    setSelection(matching);
    setNotice(matching.length ? `${item.name}: related saved alert selected.` : `${item.name}: no saved alert found. Create one in Simulation Studio.`);
  }, [deviceSelection, loaded, library.items]);
  async function perform(task) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusy(true); setError(''); setNotice('');
    try { await task(); } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  async function saveItems(items) {
    const result = await api('/household/simulations', { method: 'PUT', body: JSON.stringify({ revision: library.revision, items }) });
    setLibrary(result); return result;
  }
  function addSignal() {
    setError(''); setNotice('');
    try {
      const next = appendRoomSignals(draft, catalog, roomFilter, pickedIds, kindByDevice, observation, severityByDevice);
      if (!next.name.trim()) next.name = next.type === 'single' ? catalog.devices.find(item => item.id === pickedIds[0]).name : roomFilter + ' scenario';
      setDraft(next); setPickedIds([]); setKindByDevice({}); setSeverityByDevice({}); setObservation('');
    } catch (failure) { setError(failure.message); }
  }
  function persistRun(value) {
    sessionStorage.setItem(runKey, JSON.stringify(value)); setRun(value);
  }
  let rows = [], selectionError = '';
  try { rows = selectedSignals(library.items, selection, catalog); } catch (e) { selectionError = e.message; }
  const chosen = library.items.filter(item => selection.includes(item.id));
  const expected = chosen.reduce((sum, item) => { const profile = { ...defaultProfile, ...item.profile }; return sum + item.signals.length * ((profile.mode === 'repeat' && profile.alarm === 'active' ? Math.ceil(profile.duration_seconds / profile.interval_seconds) : 1) + (profile.clear_at_end && profile.alarm !== 'clear' ? 1 : 0)); }, 0);
  const fixedHouse = isMapleHouse(catalog);
  const rooms = houseRooms;
  const inventory = roomInventory(catalog, roomFilter, draft.signals);
  const eligibleDevices = inventory.available;
  const savedRooms = fixedHouse ? houseRooms : [...new Set(catalog.devices.filter(item => !savedLocation || item.location_id === savedLocation).map(item => item.room || 'Unassigned area'))];
  const filteredItems = useMemo(() => library.items.filter(item => {
    const sources = item.signals.map(signal => catalog.devices.find(device => device.id === signal.deviceId)).filter(Boolean);
    const text = `${item.name} ${sources.map(source => `${source.name} ${source.room || ''}`).join(' ')}`.toLowerCase();
    return (!savedQuery.trim() || text.includes(savedQuery.trim().toLowerCase()))
      && (!savedType || item.type === savedType)
      && (!savedLocation || sources.some(source => source.location_id === savedLocation))
      && (!savedRoom || sources.some(source => (!savedLocation || source.location_id === savedLocation) && (source.room || 'Unassigned area') === savedRoom))
      && (!savedDevice || item.signals.some(signal => signal.deviceId === savedDevice));
  }), [library.items, catalog.devices, savedQuery, savedType, savedLocation, savedRoom, savedDevice]);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / 10));
  const pageItems = filteredItems.slice((Math.min(savedPage, pageCount) - 1) * 10, Math.min(savedPage, pageCount) * 10);
  useEffect(() => { setSavedPage(1); }, [savedQuery, savedType, savedLocation, savedRoom, savedDevice]);
  useEffect(() => { setSavedPage(page => Math.min(page, pageCount)); }, [pageCount]);
  const single = chosen.length === 1 && chosen[0].type === 'single';
  const title = name.trim() || chosen.map(item => item.name).join(' + ').slice(0, 120);
  async function triggerLegacy() {
    await perform(async () => {
      let batch = pending ? run : null;
      if (!batch) {
        const signals = selectedSignals(library.items, selection, catalog);
        if (!signals.length) throw new Error('Choose device alerts to send.');
        const incident = target === 'auto' ? undefined : target;
        batch = { incident, name: title, rows: signals.map(row => {
          const source = catalog.devices.find(item => item.id === row.deviceId);
          const location = catalog.locations.find(item => item.id === source.location_id);
          if (!location) throw new Error('Device location was removed. Edit the saved simulation.');
          return { accepted: false, payload: { ...signalPayload({ ...row, observation: row.observation || `Synthetic ${humanize(row.kind)} detected. Cause and occupancy unverified.` }, source, location, household, incident), incident_name: title } };
        }) };
        persistRun(batch);
      }
      for (let index = 0; index < batch.rows.length; index++) {
        if (batch.rows[index].accepted) continue;
        const receipt = await api('/events', { method: 'POST', body: JSON.stringify(batch.rows[index].payload) });
        batch = { ...batch, rows: batch.rows.map((row, i) => i === index ? { ...row, accepted: true } : row) };
        persistRun(batch); onAccepted(receipt.incident_id);
      }
      setNotice(`${batch.rows.length} device alerts accepted. The briefing will update as they are assessed.`);
      setSelection([]); setName('');
    });
  }
  async function trigger() {
    if (pending) return triggerLegacy();
    await perform(async () => {
      const payload = request || { request_id: crypto.randomUUID(), definition_ids: selection, incident_id: target === 'auto' ? null : target };
      sessionStorage.setItem(requestKey, JSON.stringify(payload)); setRequest(payload);
      try {
        const result = await api('/household/runs', { method: 'POST', body: JSON.stringify(payload) });
        setStarted(result); setSelection([]); setNotice('Run scheduled in the cloud. It continues when this tab closes.');
        sessionStorage.removeItem(requestKey); setRequest(null);
      } catch (failure) {
        if ([400, 404].includes(failure.status)) { sessionStorage.removeItem(requestKey); setRequest(null); }
        throw failure;
      }
    });
  }
  const feedback = <>{error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}</>;
  const triggerPanel = <section className="card alert-composer"><h2>Trigger Alert / Scenario</h2>
    {mappedDevice && deviceTypes[mappedDevice.type]?.kinds.length > 0 && <div className="selected-device-summary"><p><strong>{mappedDevice.name}</strong><br/>{mappedDevice.room}</p><button disabled={busy || !ready || !mappedDevice.enabled} onClick={() => {
      const signal = deviceTypes[mappedDevice.type].kinds[0];
      setDraft({ ...blank(), name: mappedDevice.name, signals: [{ deviceId: mappedDevice.id, kind: signal, observation: '' }] });
      setPickedIds([]); setKindByDevice({}); setRoomFilter(mappedDevice.room); setView('create'); navigate('simulation-lab');
    }}>Create alert for this device</button></div>}
    <fieldset disabled={!loaded || busy || pending || !!request || !ready || disabled}>
      <label>Saved alert or scenario<select multiple size={Math.min(5, Math.max(2, library.items.length))} value={selection} onChange={e => setSelection([...e.target.selectedOptions].map(option => option.value))}>{library.items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.type === 'single' ? 'Single · 1 device' : `Scenario · ${item.signals.length} devices`}</option>)}</select></label>
      {!library.items.length && <p>No saved alerts or scenarios. Create one in Simulation Studio.</p>}
      <label>Incident assignment<select value={target} onChange={e => setTarget(e.target.value)}><option value="auto">Automatic · create or join related incident</option>{incidents.filter(item => !item.resolved_at && !item.deletion_started_at).map(item => <option key={item.incident_id} value={item.incident_id}>{incidentLabel(item)}</option>)}</select></label>
    </fieldset>
    {rows.length > 0 && <p className="trigger-summary">{chosen.length} selected · {rows.length} distinct devices · {expected} scheduled signals</p>}
    <button className="primary" disabled={busy || disabled || !ready || !loaded || (!pending && !request && (!rows.length || !!selectionError))} onClick={trigger}>{busy ? 'Scheduling…' : request ? 'Retry run request' : pending ? 'Retry previous delivery' : single ? 'Send single alert' : chosen.length === 1 ? 'Send scenario' : 'Send selected alerts & scenarios'}</button>
    {selectionError && <p className="error" role="alert">{selectionError}</p>}
    {pending && <p>{run.rows.filter(row => row.accepted).length} of {run.rows.length} accepted. Retry keeps the same event identities; accepted alerts are skipped.</p>}
    {feedback}
    <SimulationRuns api={api} household={household} started={started} onSelect={onAccepted} active={active} incidents={incidents}/>
  </section>;
  if (embedded) return <div className="command-workbench">{map}<div className="command-rail">{briefing}{triggerPanel}</div></div>;
  return <>
    <nav className="view-tabs" aria-label="Simulation Studio sections"><button aria-current={view === 'create' ? 'page' : undefined} onClick={() => setView('create')}>Create simulation</button><button aria-current={view === 'saved' ? 'page' : undefined} onClick={() => setView('saved')}>Saved simulations · {library.items.length}</button></nav>
    <div hidden={view !== 'create'}><section className="card alert-composer simulation-editor"><div className="row"><h2>{editing ? 'Edit simulation' : 'Create simulation'}</h2><button onClick={() => navigate('command-center')}>Command Center</button></div>
      <form onSubmit={e => { e.preventDefault(); perform(async () => {
        if (draft.type === 'single' && draft.signals.length !== 1) throw new Error('A single alert needs exactly one device.');
        if (draft.type === 'scenario' && draft.signals.length < 2) throw new Error('A scenario needs at least two different devices.');
        const interval = draft.profile?.interval_seconds || 60;
        const profile = { ...defaultProfile, mode: draft.profile?.mode === 'repeat' ? 'repeat' : 'on_change', interval_seconds: interval, duration_seconds: Math.max(300, interval * 2) };
        await saveItems([...library.items.filter(item => item.id !== draft.id), { ...draft, profile }]);
        setDraft(blank()); setPickedIds([]); setKindByDevice({}); setObservation(''); setNotice('Definition saved.');
      }); }}>
        <fieldset disabled={busy || !loaded || !ready}>
          <div className="definition-meta">
            <label>Room / area<select value={roomFilter} onChange={e => { setRoomFilter(e.target.value); setPickedIds([]); setKindByDevice({}); setError(''); setNotice(''); }}><option value="">Choose a room</option>{rooms.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>Name<input required maxLength={120} value={draft.name} onChange={e => setDraft(old => ({ ...old, name: e.target.value }))} placeholder="Simulation name"/></label>
            <label>Type<select value={draft.type} onChange={e => { if (e.target.value === 'single' && draft.signals.length > 1) { setError('Remove extra devices before switching to Single alert.'); return; } setDraft(old => ({ ...old, type: e.target.value })); setPickedIds([]); setKindByDevice({}); setError(''); }}><option value="single">Single alert · 1 device</option><option value="scenario">Scenario · 2+ devices</option></select></label>
            <label>Repeat interval<select value={draft.profile?.mode === 'repeat' ? String(draft.profile.interval_seconds) : 'once'} onChange={e => setDraft(old => ({ ...old, profile: { ...defaultProfile, mode: e.target.value === 'once' ? 'on_change' : 'repeat', interval_seconds: e.target.value === 'once' ? 60 : Number(e.target.value) } }))}><option value="once">Once</option>{[60, 120, 180, 240, 300, 600, 900].map(seconds => <option key={seconds} value={seconds}>{seconds / 60} min</option>)}
              {draft.profile?.mode === 'repeat' && ![60,120,180,240,300,600,900].includes(draft.profile.interval_seconds) && <option value={draft.profile.interval_seconds}>{draft.profile.interval_seconds}s</option>}
            </select></label>
          </div>
          {draft.profile?.mode === 'repeat' && <small className="form-help">Repeats for {Math.max(300, (draft.profile.interval_seconds || 60) * 2) / 60} minutes; no automatic clear.</small>}
          <div className="room-availability" role="status">{roomFilter ? <><strong>{roomFilter}</strong><span>{inventory.registered.length} installed · {inventory.available.length} available · {inventory.added} added</span></> : <span>Choose a room to see its devices.</span>}</div>
          <div className="available-device-list" role="group" aria-label={draft.type === 'scenario' ? 'Choose multiple available devices' : 'Choose one available device'}>
            {eligibleDevices.map(source => <label key={source.id} className={pickedIds.includes(source.id) ? 'device-choice chosen' : 'device-choice'}>
              <input type={draft.type === 'scenario' ? 'checkbox' : 'radio'} name="available-device" checked={pickedIds.includes(source.id)} disabled={draft.type === 'single' && draft.signals.length === 1} onChange={() => setPickedIds(old => draft.type === 'single' ? [source.id] : old.includes(source.id) ? old.filter(id => id !== source.id) : [...old, source.id])}/>
              <span>{source.name.startsWith(source.room + ' · ') ? source.name.slice(source.room.length + 3) : source.name}</span>
            </label>)}
          </div>
          <div className="pending-device-alerts">{pickedIds.map(id => {
            const source = eligibleDevices.find(item => item.id === id);
            if (!source) return null;
            const signal = kindByDevice[id] || supportedKinds(source)[0];
            const kinds = supportedKinds(source);
            return <div className="pending-device-alert" key={id}><strong>{source.name}</strong>
              {kinds.length > 1 ? <label>Signal<select value={signal} onChange={e => setKindByDevice(old => ({ ...old, [id]: e.target.value }))}>{kinds.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></label> : <span className="signal-kind">Signal: {humanize(signal)}</span>}
              <label>Simulation severity<select value={severityByDevice[id] || 'auto'} onChange={e => setSeverityByDevice(old => ({ ...old, [id]: e.target.value }))}>{Object.entries(simulationSeverities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>;
          })}</div>
          <details className="simulation-note"><summary>Optional device details</summary><input aria-label="Additional device details" maxLength={600} value={observation} onChange={e => setObservation(e.target.value)} placeholder="Additional observation"/></details>
          <button type="button" disabled={!pickedIds.length || (draft.type === 'single' && draft.signals.length >= 1)} onClick={addSignal}>Add {pickedIds.length || ''} device {pickedIds.length === 1 ? 'alert' : 'alerts'}</button>
          <div className="definition-count">{draft.signals.length} device {draft.signals.length === 1 ? 'alert' : 'alerts'} in definition{draft.type === 'scenario' ? ' · minimum 2' : ' · maximum 1'}</div>
          <p className="form-help">Simulation severity is exercise input, not a real sensor measurement. Automatic uses the signal and related evidence.</p>
          <ul className="signal-queue">{draft.signals.map(row => <li key={row.deviceId}><div><strong>{catalog.devices.find(item => item.id === row.deviceId)?.name || 'Removed device'}</strong><small>{humanize(row.kind)} · {signalPriority(row.kind)}</small><label>Simulation severity<select value={row.severity || 'auto'} onChange={e => setDraft(old => ({ ...old, signals: old.signals.map(signal => signal.deviceId === row.deviceId ? { ...signal, severity: e.target.value } : signal) }))}>{Object.entries(simulationSeverities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><button type="button" onClick={() => setDraft(old => ({ ...old, signals: old.signals.filter(item => item.deviceId !== row.deviceId) }))}>Remove</button></li>)}</ul>
          <div className="actions"><button className="primary" disabled={!canSave}>Save {draft.type === 'single' ? 'single alert' : 'scenario'}</button>{editing && <button type="button" onClick={() => { setDraft(blank()); setPickedIds([]); setKindByDevice({}); }}>Cancel editing</button>}</div>
          <div className="simulation-feedback">
            {feedback}
            {roomFilter && !inventory.available.length && <p className="notice" role="status">{!inventory.enabled.length ? 'No enabled simulation devices in this room.' : 'All available devices in this room are already added.'} <button type="button" onClick={() => navigate('settings')}>Add or enable a device</button></p>}
            {draft.type === 'scenario' && draft.signals.length < 2 && <p className="form-help">Select at least two distinct devices. Each device can appear once.</p>}
          </div>
        </fieldset>
      </form>
    </section>
    </div><div hidden={view !== 'saved'}>{feedback}<section className="card saved-library"><div className="row"><div><h2>Saved alerts and scenarios</h2><p>{filteredItems.length} of {library.items.length} definitions</p></div><button disabled={busy} onClick={() => perform(reload)}>Refresh</button></div>
      <div className="saved-filters">
        <label>Search<input value={savedQuery} onChange={e => setSavedQuery(e.target.value)} placeholder="Name, room or device"/></label>
        <label>Type<select value={savedType} onChange={e => setSavedType(e.target.value)}><option value="">All types</option><option value="single">Single alerts</option><option value="scenario">Scenarios</option></select></label>
        {!fixedHouse && <label>Location<select value={savedLocation} onChange={e => { setSavedLocation(e.target.value); setSavedRoom(''); setSavedDevice(''); }}><option value="">All locations</option>{catalog.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <label>Room / area<select value={savedRoom} onChange={e => { setSavedRoom(e.target.value); setSavedDevice(''); }}><option value="">All rooms / areas</option>{savedRooms.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Device<select value={savedDevice} onChange={e => setSavedDevice(e.target.value)}><option value="">All devices</option>{catalog.devices.filter(item => (!savedLocation || item.location_id === savedLocation) && (!savedRoom || (item.room || 'Unassigned area') === savedRoom)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      {!pageItems.length && <p>No saved definitions match these filters.</p>}
      <div className="saved-definition-list">{pageItems.map(item => <article className="catalog-item" key={item.id}><div className="row"><div><h3>{item.name}</h3><p><span className="badge">{item.type === 'single' ? 'SINGLE ALERT' : 'SCENARIO'}</span> · {item.signals.length} {item.signals.length === 1 ? 'device' : 'devices'}</p></div><div className="actions"><button disabled={busy} onClick={() => { setView('create'); setPickedIds([]); setKindByDevice({}); setRoomFilter(catalog.devices.find(device => device.id === item.signals[0]?.deviceId)?.room || ''); setError(''); setNotice(''); setDraft({ ...item, signals: item.signals.map(row => ({ ...row })) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button><button disabled={busy} onClick={() => { if (window.confirm(`Delete saved definition “${item.name}”? Incident evidence is unchanged.`)) perform(async () => { await saveItems(library.items.filter(row => row.id !== item.id)); if (draft.id === item.id) setDraft(blank()); setSelection(old => old.filter(id => id !== item.id)); }); }}>Delete</button></div></div>
        <ul className="definition-devices">{item.signals.map(signal => { const source = catalog.devices.find(device => device.id === signal.deviceId); const site = catalog.locations.find(location => location.id === source?.location_id); return <li key={signal.deviceId}><strong>{source?.name || 'Removed device'}</strong><span>{site?.name || 'Unknown location'} · {source?.room || 'Unassigned area'} · {humanize(signal.kind)}</span></li>; })}</ul>
      </article>)}</div>
      {filteredItems.length > 10 && <nav className="pagination" aria-label="Saved simulation pages"><button disabled={savedPage <= 1} onClick={() => setSavedPage(page => page - 1)}>Previous</button><span>Page {Math.min(savedPage, pageCount)} of {pageCount}</span><button disabled={savedPage >= pageCount} onClick={() => setSavedPage(page => page + 1)}>Next</button></nav>}
    </section></div>
  </>;
}
