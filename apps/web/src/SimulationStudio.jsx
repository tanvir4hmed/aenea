import React, { useEffect, useMemo, useRef, useState } from 'react';
import { deviceTypes, humanize, signalPayload, signalPriority } from './devices';
import { incidentLabel } from './incidentNames';
import { selectedSignals, selectionForDevice } from './simulations';
import SimulationRuns from './SimulationRuns';

const defaultProfile = { mode: 'on_change', interval_seconds: 60, duration_seconds: 300, alarm: 'active', connectivity: 'online', clear_at_end: false };
const blank = () => ({ id: crypto.randomUUID(), name: '', type: 'single', signals: [], profile: { ...defaultProfile } });

export default function SimulationStudio({ api, household, catalog, ready, selected, incidents, onAccepted, onBusy, navigate, disabled, deviceSelection, embedded = false, map, briefing }) {
  const [library, setLibrary] = useState({ revision: null, items: [] }), [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(blank), [deviceId, setDeviceId] = useState(''), [kind, setKind] = useState(''), [observation, setObservation] = useState('');
  const [locationId, setLocationId] = useState(''), [roomFilter, setRoomFilter] = useState('');
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
  const device = catalog.devices.find(item => item.id === deviceId);
  const editing = library.items.some(item => item.id === draft.id);
  const requiredSignals = draft.type === 'single' ? 1 : 2;
  const canSave = draft.name.trim() && draft.signals.length >= requiredSignals;
  async function reload() {
    const value = await api('/household/simulations'); setLibrary(value); setLoaded(true);
  }
  useEffect(() => { reload().catch(e => setError(e.message)); }, [household]);
  useEffect(() => {
    if (!deviceSelection) return;
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
    setError('');
    if (!device?.enabled || !deviceTypes[device.type]?.kinds.includes(kind)) return;
    if (draft.signals.some(row => row.deviceId === deviceId)) { setError('This device is already included. Each device can appear once.'); return; }
    if (draft.signals.length >= (draft.type === 'single' ? 1 : 200)) { setError(draft.type === 'single' ? 'Single alert contains one device. Choose Scenario for several devices.' : 'Use up to 200 devices per scenario.'); return; }
    setDraft(old => ({ ...old, signals: [...old.signals, { deviceId, kind, observation: observation.trim() }] })); setObservation('');
  }
  function persistRun(value) {
    sessionStorage.setItem(runKey, JSON.stringify(value)); setRun(value);
  }
  let rows = [], selectionError = '';
  try { rows = selectedSignals(library.items, selection, catalog); } catch (e) { selectionError = e.message; }
  const chosen = library.items.filter(item => selection.includes(item.id));
  const expected = chosen.reduce((sum, item) => { const profile = { ...defaultProfile, ...item.profile }; return sum + item.signals.length * ((profile.mode === 'repeat' && profile.alarm === 'active' ? Math.ceil(profile.duration_seconds / profile.interval_seconds) : 1) + (profile.clear_at_end && profile.alarm !== 'clear' ? 1 : 0)); }, 0);
  const rooms = [...new Set(catalog.devices.filter(item => !locationId || item.location_id === locationId).map(item => item.room || 'Unassigned area'))];
  const eligibleDevices = catalog.devices.filter(item => deviceTypes[item.type]?.kinds.length && (!locationId || item.location_id === locationId) && (!roomFilter || (item.room || 'Unassigned area') === roomFilter));
  const savedRooms = [...new Set(catalog.devices.filter(item => !savedLocation || item.location_id === savedLocation).map(item => item.room || 'Unassigned area'))];
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
    <fieldset disabled={!loaded || busy || pending || !!request || !ready || disabled}>
      <label>Saved alert or scenario<select multiple size={Math.min(5, Math.max(2, library.items.length))} value={selection} onChange={e => setSelection([...e.target.selectedOptions].map(option => option.value))}>{library.items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.type === 'single' ? 'Single · 1 device' : `Scenario · ${item.signals.length} devices`}</option>)}</select></label>
      {!library.items.length && <p>No saved alerts or scenarios. Create one in Simulation Studio.</p>}
      <label>Incident assignment<select value={target} onChange={e => setTarget(e.target.value)}><option value="auto">Automatic · create or join related incident</option>{incidents.filter(item => !item.resolved_at && !item.deletion_started_at).map(item => <option key={item.incident_id} value={item.incident_id}>{incidentLabel(item)}</option>)}</select></label>
    </fieldset>
    {selectionError && <p className="error" role="alert">{selectionError}</p>}
    {rows.length > 0 && <p className="trigger-summary">{chosen.length} selected · {rows.length} distinct devices · {expected} scheduled signals</p>}
    <button className="primary" disabled={busy || disabled || !ready || !loaded || (!pending && !request && (!rows.length || !!selectionError))} onClick={trigger}>{busy ? 'Scheduling…' : request ? 'Retry run request' : pending ? 'Retry previous delivery' : single ? 'Send single alert' : chosen.length === 1 ? 'Send scenario' : 'Send selected alerts & scenarios'}</button>
    {pending && <p>{run.rows.filter(row => row.accepted).length} of {run.rows.length} accepted. Retry keeps the same event identities; accepted alerts are skipped.</p>}
    {feedback}
    <SimulationRuns api={api} household={household} started={started} onSelect={onAccepted}/>
  </section>;
  if (embedded) return <div className="command-workbench">{map}<div className="command-rail">{briefing}{triggerPanel}</div></div>;
  return <>
    <section className="card alert-composer simulation-editor"><div className="row"><div><h2>{editing ? 'Edit saved definition' : 'Create simulation'}</h2><p>Save reusable alerts here. Command Center automatically creates or joins a related incident when you send them.</p></div><button onClick={() => navigate('command-center')}>Go to Command Center</button></div>
      {feedback}
      <form onSubmit={e => { e.preventDefault(); perform(async () => {
        if (draft.type === 'single' && draft.signals.length !== 1) throw new Error('A single alert needs exactly one device.');
        if (draft.type === 'scenario' && draft.signals.length < 2) throw new Error('A scenario needs at least two different devices.');
        await saveItems([...library.items.filter(item => item.id !== draft.id), draft]); setDraft(blank()); setNotice('Definition saved. Trigger it from Command Center.');
      }); }}>
        <fieldset disabled={busy || !loaded || !ready}><legend>Definition</legend>
          <label>Name<input required maxLength={120} value={draft.name} onChange={e => setDraft(old => ({ ...old, name: e.target.value }))} placeholder="Kitchen smoke / Upstairs fire scenario"/></label>
          <label>Type<select value={draft.type} onChange={e => { if (e.target.value === 'single' && draft.signals.length > 1) { setError('Remove extra devices before switching to Single alert.'); return; } setDraft(old => ({ ...old, type: e.target.value })); }}><option value="single">Single alert · one device</option><option value="scenario">Scenario · multiple devices</option></select></label>
          <div className="form-grid"><label>Reporting mode<select value={draft.profile?.mode || 'on_change'} onChange={e => setDraft(old => ({ ...old, profile: { ...defaultProfile, ...old.profile, mode: e.target.value, alarm: 'active' } }))}><option value="on_change">State change</option><option value="repeat">Repeat while active</option></select></label>
          <label>Initial state<select disabled={draft.profile?.mode === 'repeat'} value={draft.profile?.alarm || 'active'} onChange={e => setDraft(old => ({ ...old, profile: { ...defaultProfile, ...old.profile, alarm: e.target.value } }))}><option value="active">Alarm active</option><option value="clear">Alarm clear</option><option value="unknown">Unknown</option></select></label>
          <label>Connectivity<select value={draft.profile?.connectivity || 'online'} onChange={e => setDraft(old => ({ ...old, profile: { ...defaultProfile, ...old.profile, connectivity: e.target.value } }))}><option value="online">Online</option><option value="offline">Offline</option><option value="unknown">Unknown</option></select></label>
          <label>Duration (seconds)<input type="number" min="60" max="3600" required value={draft.profile?.duration_seconds ?? 300} onChange={e => setDraft(old => ({ ...old, profile: { ...defaultProfile, ...old.profile, duration_seconds: Number(e.target.value) } }))}/></label>
          <label>Repeat interval (seconds)<input type="number" min="60" max="900" disabled={draft.profile?.mode !== 'repeat'} value={draft.profile?.interval_seconds ?? 60} onChange={e => setDraft(old => ({ ...old, profile: { ...defaultProfile, ...old.profile, interval_seconds: Number(e.target.value) } }))}/></label></div>
          <label><input type="checkbox" checked={draft.profile?.clear_at_end || false} onChange={e => setDraft(old => ({ ...old, profile: { ...defaultProfile, ...old.profile, clear_at_end: e.target.checked } }))}/>Send a clear state at the end</label>
          <div className="form-grid"><label>Location<select value={locationId} onChange={e => { setLocationId(e.target.value); setRoomFilter(''); setDeviceId(''); setKind(''); }}><option value="">All locations</option>{catalog.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Room / area<select value={roomFilter} onChange={e => { setRoomFilter(e.target.value); setDeviceId(''); setKind(''); }}><option value="">All rooms / areas</option>{rooms.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
          <label>Device<select value={deviceId} onChange={e => { const source = catalog.devices.find(item => item.id === e.target.value); setDeviceId(source?.id || ''); setKind(deviceTypes[source?.type]?.kinds[0] || ''); }}><option value="">Choose a device</option>{eligibleDevices.map(item => <option key={item.id} value={item.id} disabled={!item.enabled}>{catalog.locations.find(site => site.id === item.location_id)?.name} / {item.room || 'Unassigned'} / {item.name}{item.enabled ? '' : ' (disabled)'}</option>)}</select></label>
          <label>Signal type<select value={kind} onChange={e => setKind(e.target.value)}><option value="">Choose a signal</option>{(deviceTypes[device?.type]?.kinds || []).map(value => <option key={value} value={value}>{humanize(value)} · {signalPriority(value)}</option>)}</select></label>
          {kind && <p className="form-help">Priority: <strong>{signalPriority(kind)}</strong>. Notification-only signals do not qualify for a red alert on their own.</p>}
          <label>Additional device details (optional)<input maxLength={600} value={observation} onChange={e => setObservation(e.target.value)} placeholder="E.g. smoke detected near the kitchen ceiling"/></label>
          <button type="button" disabled={!device?.enabled || !kind} onClick={addSignal}>Add device alert to definition</button>
          <ul className="signal-queue">{draft.signals.map(row => <li key={row.deviceId}>{catalog.devices.find(item => item.id === row.deviceId)?.name || 'Removed device'} · {humanize(row.kind)}<p>{row.observation || 'Default device description'}</p><button type="button" onClick={() => setDraft(old => ({ ...old, signals: old.signals.filter(item => item.deviceId !== row.deviceId) }))}>Remove</button></li>)}</ul>
          {draft.type === 'scenario' && draft.signals.length < 2 && <p className="form-help">Add at least two different devices to save a scenario.</p>}
          <div className="actions"><button className="primary" disabled={!canSave}>Save {draft.type === 'single' ? 'single alert' : 'scenario'}</button>{editing && <button type="button" onClick={() => setDraft(blank())}>Cancel editing</button>}</div>
        </fieldset>
      </form>
    </section>
    <section className="card saved-library"><div className="row"><div><h2>Saved alerts and scenarios</h2><p>{filteredItems.length} of {library.items.length} definitions</p></div><button disabled={busy} onClick={() => perform(reload)}>Refresh</button></div>
      <div className="saved-filters">
        <label>Search<input value={savedQuery} onChange={e => setSavedQuery(e.target.value)} placeholder="Name, room or device"/></label>
        <label>Type<select value={savedType} onChange={e => setSavedType(e.target.value)}><option value="">All types</option><option value="single">Single alerts</option><option value="scenario">Scenarios</option></select></label>
        <label>Location<select value={savedLocation} onChange={e => { setSavedLocation(e.target.value); setSavedRoom(''); setSavedDevice(''); }}><option value="">All locations</option>{catalog.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Room / area<select value={savedRoom} onChange={e => { setSavedRoom(e.target.value); setSavedDevice(''); }}><option value="">All rooms / areas</option>{savedRooms.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Device<select value={savedDevice} onChange={e => setSavedDevice(e.target.value)}><option value="">All devices</option>{catalog.devices.filter(item => (!savedLocation || item.location_id === savedLocation) && (!savedRoom || (item.room || 'Unassigned area') === savedRoom)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      {!pageItems.length && <p>No saved definitions match these filters.</p>}
      <div className="saved-definition-list">{pageItems.map(item => <article className="catalog-item" key={item.id}><div className="row"><div><h3>{item.name}</h3><p><span className="badge">{item.type === 'single' ? 'SINGLE ALERT' : 'SCENARIO'}</span> · {item.signals.length} {item.signals.length === 1 ? 'device' : 'devices'}</p></div><div className="actions"><button disabled={busy} onClick={() => { setDraft({ ...item, signals: item.signals.map(row => ({ ...row })) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button><button disabled={busy} onClick={() => { if (window.confirm(`Delete saved definition “${item.name}”? Incident evidence is unchanged.`)) perform(async () => { await saveItems(library.items.filter(row => row.id !== item.id)); if (draft.id === item.id) setDraft(blank()); setSelection(old => old.filter(id => id !== item.id)); }); }}>Delete</button></div></div>
        <ul className="definition-devices">{item.signals.map(signal => { const source = catalog.devices.find(device => device.id === signal.deviceId); const site = catalog.locations.find(location => location.id === source?.location_id); return <li key={signal.deviceId}><strong>{source?.name || 'Removed device'}</strong><span>{site?.name || 'Unknown location'} · {source?.room || 'Unassigned area'} · {humanize(signal.kind)}</span></li>; })}</ul>
      </article>)}</div>
      {filteredItems.length > 10 && <nav className="pagination" aria-label="Saved simulation pages"><button disabled={savedPage <= 1} onClick={() => setSavedPage(page => page - 1)}>Previous</button><span>Page {Math.min(savedPage, pageCount)} of {pageCount}</span><button disabled={savedPage >= pageCount} onClick={() => setSavedPage(page => page + 1)}>Next</button></nav>}
    </section>
  </>;
}
