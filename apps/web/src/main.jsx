import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { accessToken, callback, expireSession, hasSession, login, logout } from './auth';
import './style.css';
import IncidentHistory from './IncidentHistory';
import AlexaSimulator from './AlexaSimulator';
import ActionSettings from './ActionSettings';
import IncidentPicker from './IncidentPicker';
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
const currentPage = () => { const value = location.pathname.split('/')[1] || 'command-center'; return ['check-in', 'handoff'].includes(value) ? 'incident-history' : value; };
function App() {
  const [config, setConfig] = useState(null), [error, setError] = useState('');
  const [authenticated, setAuthenticated] = useState(hasSession());
  const [page, setPage] = useState(currentPage);
  const [identity, setIdentity] = useState(''), [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState(() => sessionStorage.getItem(incidentStorageKey) || ''), [timeline, setTimeline] = useState([]);
  const [notice, setNotice] = useState('');
  const [studioBusy, setStudioBusy] = useState(false);
  const [deviceSelection, setDeviceSelection] = useState(null);
  const [studioEpoch, setStudioEpoch] = useState(0);
  const [catalog, setCatalog] = useState({ revision: null, locations: [], devices: [] });
  const [catalogReady, setCatalogReady] = useState(false), [catalogBusy, setCatalogBusy] = useState(false);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [guestPassVisible, setGuestPassVisible] = useState(false), [copyNotice, setCopyNotice] = useState('');
  const [incidentCursor, setIncidentCursor] = useState(null), [timelineCursor, setTimelineCursor] = useState(null);
  const additionalPages = useRef(false);
  const activeIncident = useRef(selected);
  activeIncident.current = selected;
  const selectionMade = useRef(!!selected);
  function selectIncident(id) { selectionMade.current = true; if (activeIncident.current === id) return; activeIncident.current = id; setSelected(id); setIncidentState(null); setTimeline([]); }
  const [incidentState, setIncidentState] = useState(null);
  function receiveTimeline(data, append = false) {
    setIncidentState({ ...data, receivedAt: Date.now() });
    setTimeline(old => append ? [...new Map([...old, ...data.items].map(item => [item.sk, item])).values()] : data.items);
    if (data.incident?.incident_id) setIncidents(old => old.map(item => item.incident_id === data.incident.incident_id ? data.incident : item));
  }
  async function api(path, options = {}) {
    const token = await accessToken(config);
    const result = await fetch(config.apiUrl + path, { ...options, headers: {
      Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
    if (result.status === 401) expireSession();
    let body;
    try { body = await result.json(); } catch { body = {}; }
    if (!result.ok) {
      const operation = options.method && options.method !== 'GET' ? 'Your change' : 'This request';
      const detail = body.error || 'The service did not return a usable response.';
      const recovery = result.status >= 500 ? ' Nothing was confirmed; wait briefly, then retry.' :
        options.method && options.method !== 'GET' ? ' Check the current incident before retrying so the action is not duplicated.' : ' Refresh the current view and try again.';
      const failure = new Error(`${operation} could not complete (${result.status}): ${detail}.${recovery}`); failure.status = result.status; throw failure;
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
    sessionStorage.removeItem('aenea-trigger-' + identity);
    setStudioEpoch(value => value + 1);
  }
  function incidentDeleted(id) {
    sessionStorage.removeItem(`aenea-note-${identity}-${id}`);
    setIncidents(old => old.filter(item => item.incident_id !== id));
    if (selected === id) { setSelected(''); setTimeline([]); setIncidentState(null); }
    try {
      const run = JSON.parse(sessionStorage.getItem('aenea-trigger-' + identity) || 'null');
      if (run?.incident === id) sessionStorage.removeItem('aenea-trigger-' + identity);
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
      setPage(currentPage());
    })().catch(e => setError(e.message));
    const onPop = () => setPage(currentPage());
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
    if (!config || !authenticated) return;
    let active = true, running = false, cursor = null;
    const tick = async () => {
      if (running) return; running = true;
      try { const data = await api('/incidents' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
        if (!active) return;
        cursor = data.next_cursor;
        setIncidents(old => [...new Map([...old, ...data.items].map(item => [item.incident_id, item])).values()]);
        if (!selectionMade.current && !activeIncident.current) { const open = data.items.filter(item => !item.resolved_at).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); if (open.length) selectIncident(open[0].incident_id); }
      } catch (failure) { if (active) setError(failure.message); } finally { running = false; }
    };
    const timer = setInterval(tick, 10000);
    return () => { active = false; clearInterval(timer); };
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
        if (active && activeIncident.current === selected) { receiveTimeline(data, additionalPages.current); if (!additionalPages.current) setTimelineCursor(data.next_cursor); }
      } catch(e) { if(active) setError(e.message); }
      finally { refreshing = false; }
    };
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [config, selected, authenticated]);
  function navigate(next) { const target = ['check-in', 'handoff'].includes(next) ? 'incident-history' : next; history.pushState(null, '', '/' + target); setPage(target); setError(''); setNotice(''); }
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
        <IncidentPicker incidents={incidents} selected={selected} onSelect={selectIncident} busy={loadingIncidents}
          onRefresh={() => loadIncidents().catch(e => setError(e.message))} onMore={incidentCursor ? () => loadIncidents(incidentCursor).catch(e => setError(e.message)) : null}/>
      </>}
      {authenticated && config && identity && <div id="device-alert-composer" key={studioEpoch} hidden={!['simulation-lab', 'command-center'].includes(page)}>
        <SimulationStudio key={identity} deviceSelection={deviceSelection} embedded={page === 'command-center'}
          map={<DeviceMap catalog={catalog} ready={catalogReady} timeline={timeline} state={incidentState} selected={selected} navigate={navigate} onDevice={setDeviceSelection}/>}
          briefing={<IncidentBriefing selected={selected} state={incidentState} timeline={timeline} navigate={navigate}/>}
          api={api} household={identity} catalog={catalog} ready={catalogReady && !catalogBusy} selected={selected} incidents={incidents} navigate={navigate} onBusy={setStudioBusy} onAccepted={id => {
          selectIncident(id); loadIncidents().catch(e => setError('Signal accepted; incident list refresh failed: ' + e.message));
        }}/>
      </div>}
      {authenticated && config && page === 'settings' && <Settings catalog={catalog} ready={catalogReady} busy={catalogBusy || studioBusy} save={saveCatalog} reload={loadCatalog} navigate={navigate} permissions={<ActionSettings api={api} catalog={catalog}/>} cleanup={<><DataControls api={api} incidents={incidents} onDeleted={incidentDeleted} onClearDrafts={clearDrafts} disabled={studioBusy}/>{incidentCursor && <button onClick={() => loadIncidents(incidentCursor).catch(error => setError(error.message))}>Load more incidents for cleanup</button>}</>}/>}
      {authenticated && config && page === 'command-center' && <IncidentSummary key={selected} api={api} incident={selected} state={incidentState} timeline={timeline} navigate={navigate} onRefresh={() => loadTimeline(selected)} onRenamed={() => loadIncidents()}/>}
      {authenticated && config && page === 'incident-history' && <IncidentHistory api={api} incidents={incidents} catalog={catalog} selected={selected} onSelect={selectIncident} state={incidentState} timeline={timeline} loading={loadingIncidents}
        onRefreshList={() => loadIncidents().catch(e => setError(e.message))} onMoreIncidents={incidentCursor ? () => loadIncidents(incidentCursor).catch(e => setError(e.message)) : null}
        onRefresh={() => loadTimeline(selected).catch(e => setError(e.message))} onMoreEvidence={timelineCursor ? () => loadTimeline(selected, timelineCursor).catch(e => setError(e.message)) : null}
        onDeleted={incidentDeleted} navigate={navigate}/>}
      {authenticated && config && page==='alexa-sim' && <AlexaSimulator config={config} api={api} incidents={incidents} selected={selected} onSelect={selectIncident} state={incidentState} timeline={timeline} onRefresh={() => loadTimeline(selected)}/>}
    </AppShell>;
}
createRoot(document.getElementById('root')).render(<App/>);
