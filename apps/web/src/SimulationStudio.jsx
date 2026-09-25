import React, { useEffect, useRef, useState } from 'react';
import { deviceTypes, humanize, signalPayload } from './devices';
import { incidentLabel } from './incidentNames';
import { selectedSignals } from './simulations';

const blank = () => ({ id: crypto.randomUUID(), name: '', type: 'single', signals: [] });

export default function SimulationStudio({ api, household, catalog, ready, selected, incidents, onAccepted, onBusy, navigate, disabled, deviceSelection, embedded = false, map, briefing }) {
  const [library, setLibrary] = useState({ revision: null, items: [] }), [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(blank), [deviceId, setDeviceId] = useState(''), [kind, setKind] = useState(''), [observation, setObservation] = useState('');
  const [selection, setSelection] = useState([]), [target, setTarget] = useState('new'), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const runKey = 'aenea-trigger-' + household;
  const [run, setRun] = useState(() => { try { return JSON.parse(sessionStorage.getItem(runKey)) || null; } catch { return null; } });
  const [legacy] = useState(() => { try { const value = JSON.parse(sessionStorage.getItem('aenea-studio-' + household)); return Array.isArray(value) ? value : []; } catch { return []; } });
  const lock = useRef(false);
  const pending = run?.rows.some(row => !row.accepted);
  const device = catalog.devices.find(item => item.id === deviceId);
  async function reload() {
    const value = await api('/household/simulations'); setLibrary(value); setLoaded(true);
  }
  useEffect(() => { reload().catch(e => setError(e.message)); }, [household]);
  useEffect(() => {
    if (!deviceSelection) return;
    const item = catalog.devices.find(item => item.id === deviceSelection.id);
    if (item) setNotice(`${item.name} selected on the map. Choose a saved alert containing it below, or create one in Simulation Studio.`);
  }, [deviceSelection]);
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
    if (draft.signals.length >= (draft.type === 'single' ? 1 : 20)) { setError(draft.type === 'single' ? 'Single alert contains one device. Choose Scenario for several devices.' : 'Use up to 20 devices per scenario.'); return; }
    setDraft(old => ({ ...old, signals: [...old.signals, { deviceId, kind, observation: observation.trim() }] })); setObservation('');
  }
  function persistRun(value) {
    sessionStorage.setItem(runKey, JSON.stringify(value)); setRun(value);
  }
  let rows = [], selectionError = '';
  try { rows = selectedSignals(library.items, selection, catalog); } catch (e) { selectionError = e.message; }
  const chosen = library.items.filter(item => selection.includes(item.id));
  const single = chosen.length === 1 && chosen[0].type === 'single';
  const title = name.trim() || chosen.map(item => item.name).join(' + ').slice(0, 120);
  const currentIncident = incidents.find(item => item.incident_id === target);
  const overBudget = target !== 'new' && (Number(currentIncident?.event_count || 0) + rows.length > 20);
  async function trigger() {
    await perform(async () => {
      let batch = pending ? run : null;
      if (!batch) {
        const signals = selectedSignals(library.items, selection, catalog);
        if (!signals.length || overBudget) throw new Error('Choose 1–20 device alerts within the incident assessment limit.');
        const incident = target === 'new' ? crypto.randomUUID() : target;
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
  const feedback = <>{error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}</>;
  const triggerPanel = <section className="card alert-composer"><h2>Trigger saved alerts</h2>
    <p>Select one or several saved alerts/scenarios. Each device sends once in this batch.</p>
    <fieldset disabled={!loaded || busy || pending || !ready || disabled}><legend>Saved simulations</legend>
      <label>Add to selection<select value="" onChange={e => { if (e.target.value) setSelection(old => [...old, e.target.value]); }}><option value="">Choose a single alert or scenario</option>{library.items.filter(item => !selection.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.name} · {item.type === 'single' ? 'Single alert' : `Scenario · ${item.signals.length} devices`}</option>)}</select></label>
      {!library.items.length && <p>No saved simulations yet. Create one in Simulation Studio.</p>}
      <ul className="trigger-selection">{chosen.map(item => <li key={item.id}><strong>{item.name}</strong><button type="button" aria-label={`Remove ${item.name} from selection`} onClick={() => setSelection(old => old.filter(id => id !== item.id))}>Remove</button></li>)}</ul>
      <label>Send to<select value={target} onChange={e => setTarget(e.target.value)}><option value="new">New incident</option>{selected && !incidents.some(item => item.incident_id === selected) && <option value={selected}>{incidentLabel({ incident_id: selected })}</option>}{incidents.map(item => <option key={item.incident_id} value={item.incident_id}>{incidentLabel(item)}</option>)}</select></label>
      {target === 'new' && <label>Incident name (optional)<input maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder={title || 'Uses the selected simulation names'}/></label>}
    </fieldset>
    {selectionError && <p className="error" role="alert">{selectionError}</p>}
    {overBudget && !pending && <p className="error">This would exceed 20 signals in the incident. Start a new incident or reduce the selection.</p>}
    {rows.length > 0 && <details><summary>Preview · {rows.length} distinct devices</summary><ul>{rows.map(row => <li key={row.deviceId}>{catalog.devices.find(item => item.id === row.deviceId)?.name} · {humanize(row.kind)}</li>)}</ul></details>}
    <button className="primary" disabled={busy || disabled || !ready || !loaded || (!pending && (!rows.length || !!selectionError || overBudget))} onClick={trigger}>{busy ? 'Sending…' : pending ? 'Retry remaining alerts' : single ? 'Send single alert' : chosen.length === 1 ? 'Send scenario' : 'Send selected alerts & scenarios'}</button>
    {pending && <p>{run.rows.filter(row => row.accepted).length} of {run.rows.length} accepted. Retry keeps the same event identities; accepted alerts are skipped.</p>}
    <div className="actions"><button disabled={busy} onClick={() => navigate('simulation-lab')}>Open Simulation Studio</button><button disabled={busy || pending} onClick={() => perform(reload)}>Reload saved simulations</button></div>
    {feedback}
  </section>;
  if (embedded) return <div className="command-workbench">{map}<div className="command-rail">{briefing}{triggerPanel}</div></div>;
  return <>
    <section className="card"><div className="row"><div><h2>Simulation Studio</h2><p>Create and save reusable single alerts or multi-device scenarios. Trigger them from Command Center.</p></div><button onClick={() => navigate('command-center')}>Go to Command Center</button></div>{feedback}<button disabled={busy} onClick={() => perform(reload)}>Reload library</button>{legacy.length > 0 && <details><summary>Previous browser queue</summary><p>Your previous queue is retained. Import its device definitions to edit and save them; importing does not send alerts.</p><button disabled={busy} onClick={() => setDraft({ ...blank(), name: 'Imported scenario', type: legacy.length === 1 ? 'single' : 'scenario', signals: legacy.map(row => ({ deviceId: row.deviceId, kind: row.kind, observation: row.observation || '' })) })}>Import previous queue</button></details>}</section>
    <div className="columns"><section className="card alert-composer"><h2>{library.items.some(item => item.id === draft.id) ? 'Edit simulation' : 'Create simulation'}</h2>
      <form onSubmit={e => { e.preventDefault(); perform(async () => { if (!draft.signals.length) throw new Error('Add at least one device alert before saving.'); await saveItems([...library.items.filter(item => item.id !== draft.id), draft]); setDraft(blank()); setNotice('Simulation saved. Select it in Command Center to trigger.'); }); }}>
        <fieldset disabled={busy || !loaded || !ready}><legend>Definition</legend>
          <label>Name<input required maxLength={120} value={draft.name} onChange={e => setDraft(old => ({ ...old, name: e.target.value }))} placeholder="Kitchen smoke / Upstairs fire scenario"/></label>
          <label>Type<select value={draft.type} onChange={e => { if (e.target.value === 'single' && draft.signals.length > 1) { setError('Remove extra devices before switching to Single alert.'); return; } setDraft(old => ({ ...old, type: e.target.value })); }}><option value="single">Single alert · one device</option><option value="scenario">Scenario · multiple devices</option></select></label>
          <label>Device<select value={deviceId} onChange={e => { const source = catalog.devices.find(item => item.id === e.target.value); setDeviceId(source?.id || ''); setKind(deviceTypes[source?.type]?.kinds[0] || ''); }}><option value="">Choose a device</option>{catalog.devices.map(item => <option key={item.id} value={item.id} disabled={!item.enabled}>{catalog.locations.find(site => site.id === item.location_id)?.name} / {item.room || 'Unassigned'} / {item.name}{item.enabled ? '' : ' (disabled)'}</option>)}</select></label>
          <label>Signal type<select value={kind} onChange={e => setKind(e.target.value)}><option value="">Choose a signal</option>{(deviceTypes[device?.type]?.kinds || []).map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>
          <label>Additional device details (optional)<input maxLength={600} value={observation} onChange={e => setObservation(e.target.value)} placeholder="E.g. smoke detected near the kitchen ceiling"/></label>
          <button type="button" disabled={!device?.enabled || !kind} onClick={addSignal}>Add device alert to definition</button>
          <ul className="signal-queue">{draft.signals.map(row => <li key={row.deviceId}>{catalog.devices.find(item => item.id === row.deviceId)?.name || 'Removed device'} · {humanize(row.kind)}<p>{row.observation || 'Default device description'}</p><button type="button" onClick={() => setDraft(old => ({ ...old, signals: old.signals.filter(item => item.deviceId !== row.deviceId) }))}>Remove</button></li>)}</ul>
          <div className="actions"><button className="primary" disabled={!draft.signals.length}>Save {draft.type === 'single' ? 'single alert' : 'scenario'}</button><button type="button" onClick={() => setDraft(blank())}>New definition</button></div>
        </fieldset>
      </form>
    </section><section className="card"><h2>Saved simulations</h2>{!library.items.length && <p>No saved simulations yet.</p>}{library.items.map(item => <article className="catalog-item" key={item.id}><h3>{item.name}</h3><p>{item.type === 'single' ? 'Single alert' : 'Scenario'} · {item.signals.length} device alerts</p><div className="actions"><button disabled={busy} onClick={() => setDraft({ ...item, signals: item.signals.map(row => ({ ...row })) })}>Edit</button><button disabled={busy} onClick={() => { if (window.confirm(`Delete saved simulation “${item.name}”? Incident evidence is unchanged.`)) perform(async () => { await saveItems(library.items.filter(row => row.id !== item.id)); if (draft.id === item.id) setDraft(blank()); setSelection(old => old.filter(id => id !== item.id)); }); }}>Delete definition</button></div></article>)}</section></div>
  </>;
}
