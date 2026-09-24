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
import Settings from './Settings';
import SimulationStudio from './SimulationStudio';
import DataControls from './DataControls';
import DeviceMap, { IncidentBriefing } from './DeviceMap';
import { incidentName } from './incidentNames';
import IncidentSummary from './IncidentSummary';

const guestAccess = { email: 'guest@aenea.qleam.com', password: 'AeneaGuest@1234' };
const incidentStorageKey = 'aenea-selected-incident';
function App() {
  const [config, setConfig] = useState(null), [error, setError] = useState('');
  const [authenticated, setAuthenticated] = useState(hasSession());
  const [page, setPage] = useState(location.pathname.split('/')[1] || 'command-center');
  const [identity, setIdentity] = useState(''), [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState(() => sessionStorage.getItem(incidentStorageKey) || ''), [timeline, setTimeline] = useState([]);
  const [notice, setNotice] = useState('');
  const [studioBusy, setStudioBusy] = useState(false);
  const [deviceSelection, setDeviceSelection] = useState(null);
  const [studioEpoch, setStudioEpoch] = useState(0);
  const [catalog, setCatalog] = useState({ revision: null, locations: [], devices: [] });
  const [catalogReady, setCatalogReady] = useState(false), [catalogBusy, setCatalogBusy] = useState(false);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [guestPassVisible, setGuestPassVisible] = useState(false), [copyNotice, setCopyNotice] = useState('');
  const [incidentCursor, setIncidentCursor] = useState(null), [timelineCursor, setTimelineCursor] = useState(null);
  const additionalPages = useRef(false);
  const activeIncident = useRef(selected);
  activeIncident.current = selected;
  const [incidentState, setIncidentState] = useState(null);
  function receiveTimeline(data, append = false) {
    setIncidentState(data);
    setTimeline(old => append ? [...new Map([...old, ...data.items].map(item => [item.sk, item])).values()] : data.items);
    if (data.incident?.incident_id) setIncidents(old => old.map(item => item.incident_id === data.incident.incident_id ? data.incident : item));
  }
  async function api(path, options = {}) {
    const token = await accessToken(config);
    const result = await fetch(config.apiUrl + path, { ...options, headers: {
      Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
    if (result.status === 401) expireSession();
    let body = {};
    try { body = await result.json(); } catch { body = {}; }
    if (!result.ok) {
      const operation = options.method && options.method !== 'GET' ? 'Your change' : 'This request';
      const detail = body.error || 'The service did not return a usable response.';
      const recovery = result.status >= 500 ? ' Nothing was confirmed; wait briefly, then retry.' :
        options.method && options.method !== 'GET' ? ' Check the current incident before retrying so the action is not duplicated.' : ' Refresh the current view and try again.';
      throw new Error(`${operation} could not complete (${result.status}): ${detail}.${recovery}`);
    }
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
  async function loadCatalog() {
    setCatalogBusy(true);
    try { const data = await api('/household/catalog'); setCatalog(data); setCatalogReady(true); }
    finally { setCatalogBusy(false); }
  }
  async function saveCatalog(next) {
    setCatalogBusy(true);
    try { const data = await api('/household/catalog', { method: 'PUT', body: JSON.stringify(next) }); setCatalog(data); }
    finally { setCatalogBusy(false); }
  }
  function clearDrafts() {
    sessionStorage.removeItem('aenea-studio-' + identity);
    setStudioEpoch(value => value + 1);
  }
  function incidentDeleted(id) {
    setIncidents(old => old.filter(item => item.incident_id !== id));
    if (selected === id) { setSelected(''); setTimeline([]); setIncidentState(null); }
    try {
      const drafts = JSON.parse(sessionStorage.getItem('aenea-studio-' + identity) || '[]');
      if (drafts.some(row => row.payload?.incident_id === id)) clearDrafts();
      else setStudioEpoch(value => value + 1);
    } catch { clearDrafts(); }
  }
  async function loadTimeline(id, cursor = null) {
    additionalPages.current = !!cursor;
    const data = await api('/incidents/' + id + '/timeline' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    if (activeIncident.current !== id) return;
    receiveTimeline(data, !!cursor);
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
    loadCatalog().catch(e => setError(e.message));
  }, [config, authenticated]);
  useEffect(() => {
    if (!selected) sessionStorage.removeItem(incidentStorageKey);
    else sessionStorage.setItem(incidentStorageKey, selected);
    setTimeline([]); setTimelineCursor(null); setIncidentState(null);
    if (!config || !selected || !authenticated) return;
    additionalPages.current = false;
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const data = await api('/incidents/' + selected + '/timeline');
        if (active) { receiveTimeline(data, additionalPages.current); if (!additionalPages.current) setTimelineCursor(data.next_cursor); }
      } catch(e) { if(active) setError(e.message); }
      finally { refreshing = false; }
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
  return <AppShell page={page} navigate={navigate} authenticated={authenticated} config={config} selected={selected} selectedName={incidentName(incidents.find(item => item.incident_id === selected) || { incident_id: selected })}
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
      {authenticated && config && page === 'command-center' && <>
        <IncidentPicker incidents={incidents} selected={selected} onSelect={setSelected} busy={loadingIncidents}
          onRefresh={() => loadIncidents().catch(e => setError(e.message))} onMore={incidentCursor ? () => loadIncidents(incidentCursor).catch(e => setError(e.message)) : null}/>
      </>}
      {authenticated && config && identity && <div id="device-alert-composer" key={studioEpoch} hidden={!['simulation-lab', 'command-center'].includes(page)}>
        <SimulationStudio key={identity} deviceSelection={deviceSelection} embedded={page === 'command-center'}
          map={<DeviceMap catalog={catalog} ready={catalogReady} timeline={timeline} state={incidentState} selected={selected} navigate={navigate} onDevice={setDeviceSelection}/>}
          briefing={<IncidentBriefing selected={selected} state={incidentState} timeline={timeline} navigate={navigate}/>}
          api={api} household={identity} catalog={catalog} ready={catalogReady && !catalogBusy} selected={selected} incidents={incidents} navigate={navigate} disabled={scenarioBusy} onBusy={setStudioBusy} onAccepted={id => {
          setSelected(id); loadIncidents().catch(e => setError('Signal accepted; incident list refresh failed: ' + e.message));
        }}/>
        <details className="card" hidden={page !== 'simulation-lab'}><summary>Built-in walkthroughs with sample devices</summary>
        <ScenarioLab api={api} household={identity} disabled={studioBusy} onBusy={setScenarioBusy} onAccepted={id => {
          setSelected(id); loadIncidents().catch(e => setError('Signal accepted; incident list refresh failed: ' + e.message));
        }} /></details>
      </div>}
      {authenticated && config && page === 'settings' && <><Settings catalog={catalog} ready={catalogReady} busy={catalogBusy || studioBusy} save={saveCatalog} reload={loadCatalog} navigate={navigate}/><Coordination key="settings" api={api} timeline={[]} simulation settingsOnly /><DataControls api={api} incidents={incidents} onDeleted={incidentDeleted} onClearDrafts={clearDrafts} disabled={studioBusy || scenarioBusy}/>{incidentCursor && <button onClick={() => loadIncidents(incidentCursor).catch(error => setError(error.message))}>Load more incidents for cleanup</button>}</>}
      {authenticated && config && page === 'command-center' && <IncidentSummary key={selected} api={api} incident={selected} state={incidentState} timeline={timeline} navigate={navigate} onRefresh={() => loadTimeline(selected)} onRenamed={() => loadIncidents()}/>}
      {authenticated && config && page === 'incident-history' && <>
        <div className="columns"><section className="card" aria-busy={loadingIncidents}><div className="row"><h2>Incidents</h2><button disabled={loadingIncidents} onClick={()=>loadIncidents().catch(e=>setError(e.message))}>{loadingIncidents ? 'Refreshing…' : 'Refresh'}</button></div>
          {!incidents.length && <div className="empty-state"><h3>{loadingIncidents ? 'Loading incidents…' : 'No incidents yet'}</h3><p>Start with a simulated signal to see the coordinated response.</p>{!loadingIncidents && page === 'command-center' && <button onClick={() => navigate('simulation-lab')}>Open Simulation lab</button>}</div>}
          {incidents.map(i=><button aria-pressed={selected===i.incident_id} className={'incident '+(selected===i.incident_id?'selected':'')} key={i.incident_id} onClick={()=>setSelected(i.incident_id)}><b>{incidentName(i)}</b><span>{i.event_count} signals · {i.status.replaceAll('_',' ')} · {i.created_at ? new Date(i.created_at).toLocaleString() : ''}</span></button>)}
          {incidentCursor && <button onClick={()=>loadIncidents(incidentCursor).catch(e=>setError(e.message))}>Load more</button>}
        </section><section className="card"><h2>Evidence timeline</h2>{!selected && <p>Select an incident to see its evidence.</p>}{selected && !timeline.length && <p>Waiting for processed evidence…</p>}
          <ol className="timeline">{timeline.filter(item=>item.event || item.kind).map(item=><li key={item.sk}><span className="badge">SIMULATED</span><h3>{(item.event?.kind || item.kind).replaceAll('_',' ')}</h3><p>{item.event?.observation || item.data?.result || item.data?.policy_reason || item.data?.message || item.data?.assessment?.summary || 'Coordination decision recorded'}</p><time>{new Date(item.event?.occurred_at || item.recorded_at).toLocaleString()}</time><small>{item.event?.source.source_id}</small></li>)}</ol>
          {timelineCursor && <button onClick={()=>loadTimeline(selected,timelineCursor).catch(e=>setError(e.message))}>Earlier / additional events</button>}
        </section></div>
        {selected && <IncidentSummary key={selected} api={api} incident={selected} state={incidentState} timeline={timeline} navigate={navigate} onRefresh={() => loadTimeline(selected)} onRenamed={() => loadIncidents()}/>}
        <details className="card"><summary>Assessment details and decision review</summary><Coordination key={selected} api={api} timeline={timeline} incident={selected} incidentState={incidentState} simulation={false} onRefresh={()=>loadTimeline(selected)} /></details>
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
