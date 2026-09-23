import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { accessToken, callback, expireSession, hasSession, login, logout } from './auth';
import './style.css';
import Coordination from './Coordination';
import AlexaSimulator from './AlexaSimulator';
import Household from './Household';
import Handoff from './Handoff';
import IncidentPicker from './IncidentPicker';
import ScenarioLab from './ScenarioLab';
import AppShell from './AppShell';
import UserGuide from './UserGuide';

const guestAccess = { email: 'guest@aenea.qleam.com', password: 'AeneaGuest@1234' };
const incidentStorageKey = 'aenea-selected-incident';
function App() {
  const [config, setConfig] = useState(null), [error, setError] = useState('');
  const [authenticated, setAuthenticated] = useState(hasSession());
  const [page, setPage] = useState(location.pathname.split('/')[1] || 'command-center');
  const [identity, setIdentity] = useState(''), [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState(() => sessionStorage.getItem(incidentStorageKey) || ''), [timeline, setTimeline] = useState([]);
  const [kind, setKind] = useState('smoke'), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(''), [pending, setPending] = useState(null);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [guestPassVisible, setGuestPassVisible] = useState(false), [copyNotice, setCopyNotice] = useState('');
  const [incidentCursor, setIncidentCursor] = useState(null), [timelineCursor, setTimelineCursor] = useState(null);
  const additionalPages = useRef(false);
  async function api(path, options = {}) {
    const token = await accessToken(config);
    const result = await fetch(config.apiUrl + path, { ...options, headers: {
      Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
    if (result.status === 401) expireSession();
    const body = await result.json();
    if (!result.ok) throw new Error(body.error || 'Request failed; please retry.');
    return body;
  }
  async function loadIncidents(cursor = null) {
    setLoadingIncidents(true);
    try {
      const data = await api('/incidents' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
      setIdentity(data.household_id);
      setIncidents(old => cursor ? [...old, ...data.items] : data.items);
      setIncidentCursor(data.next_cursor);
    } finally { setLoadingIncidents(false); }
  }
  async function loadTimeline(id, cursor = null) {
    if (cursor) additionalPages.current = true;
    const data = await api('/incidents/' + id + '/timeline' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    setTimeline(old => cursor ? [...old, ...data.items] : data.items);
    setTimelineCursor(data.next_cursor);
  }
  useEffect(() => {
    (async () => {
      const result = await fetch('/config.json', { cache: 'no-store' });
      if (!result.ok) throw new Error('Deployment configuration is not available yet.');
      const value = await result.json();
      await callback(value); setConfig(value); setAuthenticated(hasSession());
      setPage(location.pathname.split('/')[1] || 'command-center');
    })().catch(e => setError(e.message));
    const onPop = () => setPage(location.pathname.split('/')[1] || 'command-center');
    const onExpired = () => { setAuthenticated(false); setError('Your session has ended. Please sign in again.'); };
    addEventListener('popstate', onPop); addEventListener('aenea-auth-expired', onExpired);
    return () => { removeEventListener('popstate', onPop); removeEventListener('aenea-auth-expired', onExpired); };
  }, []);
  useEffect(() => {
    if (!config || !authenticated) return;
    loadIncidents().catch(e => setError(e.message));
  }, [config, authenticated]);
  useEffect(() => {
    if (!selected) sessionStorage.removeItem(incidentStorageKey);
    else sessionStorage.setItem(incidentStorageKey, selected);
    if (!config || !selected || !authenticated) return;
    setTimeline([]); setTimelineCursor(null);
    additionalPages.current = false;
    let active = true;
    const refresh = async () => {
      if (additionalPages.current) return;
      try {
        const data = await api('/incidents/' + selected + '/timeline');
        if (active) { setTimeline(data.items); setTimelineCursor(data.next_cursor); }
      } catch(e) { if(active) setError(e.message); }
    };
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [config, selected, authenticated]);
  function navigate(next) { history.pushState(null, '', '/' + next); setPage(next); setError(''); setNotice(''); }
  async function copyGuest(value, label) {
    try { await navigator.clipboard.writeText(value); setCopyNotice(label + ' copied.'); }
    catch { setCopyNotice('Copy is unavailable. Select the value manually.'); }
  }
  async function emit(forceNew = false) {
    setBusy(true); setError(''); setNotice('');
    const camera = ['motion','doorbell','package','vehicle'].includes(kind);
    const incidentId = forceNew ? crypto.randomUUID() : selected || crypto.randomUUID();
    const payload = pending || { incident_id: incidentId, adapter: camera ? 'camera-simulator' : ['smoke','carbon_monoxide','water_leak','medical_sos'].includes(kind) ? 'sensor' : 'webhook',
      event: { event_id: crypto.randomUUID(), household_id: identity, occurred_at: new Date().toISOString(),
      source: { source_id: camera ? 'simulation-camera' : 'simulation-sensor', category: camera ? 'camera' : kind === 'severe_weather' ? 'weather' : 'sensor', simulated: true },
        kind, observation: 'Synthetic ' + kind.replaceAll('_', ' ') + ' observation' } };
    setPending(payload);
    try {
      const data = await api('/events', { method: 'POST', body: JSON.stringify(payload) });
      setSelected(data.incident_id); setPending(null);
      setNotice('Event accepted. The timeline updates after processing.');
      await loadIncidents(); await loadTimeline(data.incident_id);
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <AppShell page={page} navigate={navigate} authenticated={authenticated} config={config} selected={selected}
    onAuth={async () => { try { if (authenticated) logout(config); else await login(config); } catch(e) { setError(e.message); } }}>
      {error && <div role="alert" className="error">{error}</div>}
      {notice && <div role="status" className="notice">{notice}</div>}
      {page === 'guide' && <UserGuide navigate={navigate}/>}
      {!authenticated && page !== 'guide' && <section className="card guest-access"><h2>Welcome to Aenea</h2>
        <p>Sign in with your authorized account, or use the shared guest account to explore this public prototype.</p>
        <div className="guest-credentials">
          <label>Guest email <span className="credential-row"><input readOnly value={guestAccess.email}/>
            <button type="button" onClick={() => copyGuest(guestAccess.email, 'Guest email')}>Copy</button></span></label>
          <label>Guest password <span className="credential-row"><input readOnly type={guestPassVisible ? 'text' : 'password'} value={guestAccess.password}/>
            <button type="button" className="icon-button" aria-label={guestPassVisible ? 'Hide guest password' : 'Show guest password'}
              aria-pressed={guestPassVisible} onClick={() => setGuestPassVisible(value => !value)}>
              <span aria-hidden="true">👁</span>
            </button>
            <button type="button" onClick={() => copyGuest(guestAccess.password, 'Guest password')}>Copy</button></span></label>
        </div>
        <div className="actions"><button className="primary" disabled={!config} onClick={() => login(config).catch(e => setError(e.message))}>Open guest sign in</button><button onClick={() => navigate('guide')}>Read the user guide</button></div>
        <p className="guest-warning">Shared demo account: use fictional data only. Activity may be visible to other demo visitors.</p>
        {copyNotice && <p role="status" className="notice">{copyNotice}</p>}
      </section>}
      {authenticated && config && <div hidden={page !== 'simulation-lab'}>
        <ScenarioLab api={api} household={identity} disabled={busy || !!pending} onBusy={setScenarioBusy} onAccepted={id => {
          setSelected(id); loadIncidents().catch(e => setError('Signal accepted; incident list refresh failed: ' + e.message));
        }} />
      </div>}
      {authenticated && ['command-center','simulation-lab'].includes(page) && <>
        {page === 'command-center' && <><section className="metrics" aria-label="Workspace summary"><div className="card"><span>Loaded incidents</span><strong>{loadingIncidents ? '…' : incidents.length}</strong><small>{incidentCursor ? 'More incidents available below' : 'Your incident list'}</small></div><div className="card"><span>Selected incident</span><strong className="small">{selected ? selected.slice(0, 8) : 'Choose an incident'}</strong><small>Shared across workspace pages</small></div><div className="card"><span>Pending confirmations</span><strong>{selected ? timeline.filter(item => item.sk?.startsWith('ACTION#') && item.status === 'pending_confirmation').length : '—'}</strong><small>In the loaded incident timeline</small></div></section>
          <section className="quick-actions" aria-label="Quick actions"><button onClick={() => navigate('simulation-lab')}>Send simulated signals</button><button disabled={!selected} onClick={() => navigate('alexa-sim')}>Ask Alexa+</button><button disabled={!selected} onClick={() => navigate('handoff')}>Prepare handoff</button></section></>}
        {page==='simulation-lab' && <section className="card"><h2>Send a household signal</h2><p>Select an existing incident to add context, or start a new one. Camera motion does not establish occupancy.</p>
          <label>Signal type <select disabled={!!pending} value={kind} onChange={e=>setKind(e.target.value)}>{['smoke','carbon_monoxide','water_leak','medical_sos','severe_weather','motion','doorbell','package','vehicle'].map(k=><option key={k} value={k}>{k.replaceAll('_', ' ')}</option>)}</select></label>
          <p>{selected ? <>Target incident: <code>{selected.slice(0, 8)}</code></> : 'No incident selected. Start a new incident with this signal.'}</p>
          <div className="actions">{pending ? <button className="primary" disabled={busy || scenarioBusy || !identity} onClick={() => emit()}>{busy?'Sending…':'Retry identical signal'}</button> : <>
            <button className="primary" disabled={busy || scenarioBusy || !identity} onClick={() => emit(true)}>Start new incident with signal</button>
            <button disabled={busy || scenarioBusy || !identity || !selected} onClick={() => emit(false)}>Add signal to selected incident</button></>}
            {pending && <button disabled={busy || scenarioBusy} onClick={()=>setPending(null)}>Discard pending signal</button>}</div>
        </section>}
        <div className="columns"><section className="card" aria-busy={loadingIncidents}><div className="row"><h2>Incidents</h2><button disabled={loadingIncidents} onClick={()=>loadIncidents().catch(e=>setError(e.message))}>{loadingIncidents ? 'Refreshing…' : 'Refresh'}</button></div>
          {!incidents.length && <div className="empty-state"><h3>{loadingIncidents ? 'Loading incidents…' : 'No incidents yet'}</h3><p>Start with a simulated signal to see the coordinated response.</p>{!loadingIncidents && page === 'command-center' && <button onClick={() => navigate('simulation-lab')}>Open Simulation lab</button>}</div>}
          {incidents.map(i=><button aria-pressed={selected===i.incident_id} className={'incident '+(selected===i.incident_id?'selected':'')} key={i.incident_id} onClick={()=>setSelected(i.incident_id)}><b>{i.incident_id.slice(0,8)}</b><span>{i.event_count} signals · {i.status.replaceAll('_',' ')}</span></button>)}
          {incidentCursor && <button onClick={()=>loadIncidents(incidentCursor).catch(e=>setError(e.message))}>Load more</button>}
        </section><section className="card"><h2>Evidence timeline</h2>{!selected && <p>Select an incident to see its evidence.</p>}{selected && !timeline.length && <p>Waiting for processed evidence…</p>}
          <ol className="timeline">{timeline.filter(item=>item.event || item.kind).map(item=><li key={item.sk}><span className="badge">SIMULATED</span><h3>{(item.event?.kind || item.kind).replaceAll('_',' ')}</h3><p>{item.event?.observation || item.data?.result || item.data?.policy_reason || item.data?.message || item.data?.assessment?.summary || 'Coordination decision recorded'}</p><time>{new Date(item.event?.occurred_at || item.recorded_at).toLocaleString()}</time><small>{item.event?.source.source_id}</small></li>)}</ol>
          {timelineCursor && <button onClick={()=>loadTimeline(selected,timelineCursor).catch(e=>setError(e.message))}>Earlier / additional events</button>}
        </section></div>
        <Coordination api={api} timeline={timeline} incident={selected} simulation={page==='simulation-lab'} onRefresh={()=>loadTimeline(selected)} />
      </>}
      {authenticated && config && page==='alexa-sim' && <AlexaSimulator config={config} incidents={incidents} selected={selected} onSelect={setSelected}/>}
      {authenticated && config && ['check-in','handoff'].includes(page) && <>
        <IncidentPicker incidents={incidents} selected={selected} onSelect={setSelected}
          onRefresh={()=>loadIncidents().catch(e=>setError(e.message))}
          onMore={incidentCursor ? ()=>loadIncidents(incidentCursor).catch(e=>setError(e.message)) : null}/>
        {page==='check-in' ? <Household key={selected} config={config} incident={selected}/> :
          <Handoff key={selected} config={config} incident={selected}/>}
      </>}
    </AppShell>;
}
createRoot(document.getElementById('root')).render(<App/>);
