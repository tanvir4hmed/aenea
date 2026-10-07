import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { callback, hasSession, login, logout } from './auth';
import './style.css';
import './experience.css';
import AlexaSimulator from './AlexaSimulator';
import IncidentPicker from './IncidentPicker';
import AppShell from './AppShell';
import { requestJson } from './api';
import { createIncidentCache } from './incidentCache';
import { createRequestGate, mergeEvidence } from './incidentReads';
import { clearConversations, conversationKey } from './alexaConversation';
import { pageForPath } from './routes';

const IncidentHistory = lazy(() => import('./IncidentHistory'));
const UserGuide = lazy(() => import('./UserGuide'));
const Settings = lazy(() => import('./Settings'));
const SimulationStudio = lazy(() => import('./SimulationStudio'));
const DataControls = lazy(() => import('./DataControls'));
const DeviceMap = lazy(() => import('./DeviceMap'));
const IncidentSummary = lazy(() => import('./IncidentSummary'));

const guestAccess = { email: 'guest@aenea.qleam.com', password: 'AeneaGuest@1234' };
const incidentStorageKey = 'aenea-selected-incident';
const currentPage = () => pageForPath(location.pathname);
const currentSettingsTab = () => location.hash === '#cleanup' ? 'cleanup' : 'devices';
function App() {
  const [config, setConfig] = useState(null), [error, setError] = useState('');
  const [booting, setBooting] = useState(true);
  const [authenticated, setAuthenticated] = useState(hasSession());
  const [page, setPage] = useState(currentPage);
  const [settingsTab, setSettingsTab] = useState(currentSettingsTab);
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
  const [evidenceReady, setEvidenceReady] = useState(false), [evidenceBusy, setEvidenceBusy] = useState(false), [evidenceError, setEvidenceError] = useState('');
  const [statusError, setStatusError] = useState('');
  const statusRequests = useRef(createRequestGate()), evidenceRequests = useRef(createRequestGate());
  const incidentCache = useRef(createIncidentCache());
  const [studioMounted, setStudioMounted] = useState(false);
  const studioActive = ['simulation-lab', 'command-center'].includes(page);
  const incidentPage = ['command-center', 'alexa-sim', 'incident-history'].includes(page);
  useEffect(() => { if (studioActive) setStudioMounted(true); }, [studioActive]);
  const activeIncident = useRef(selected);
  activeIncident.current = selected;
  const selectionMade = useRef(!!selected);
  function selectIncident(id, summary = null) {
    selectionMade.current = true;
    if (activeIncident.current === id) return;
    setDeviceSelection(null);
    statusRequests.current.invalidate(); evidenceRequests.current.invalidate();
    activeIncident.current = id; setSelected(id);
    const preview = incidentCache.current.preview(id);
    const listed = summary || incidents.find(item => item.incident_id === id);
    // Keep the selected incident's location and name on screen while its live
    // status request starts. Device evidence is intentionally not carried over.
    setIncidentState(preview || (listed ? {
      household_id: identity, incident: listed, actions: [], assessment_current: false, refreshing: true,
    } : null));
    setTimeline([]); setTimelineCursor(null);
    setEvidenceReady(false); setEvidenceBusy(false); setEvidenceError(''); setStatusError('');
  }
  const [incidentState, setIncidentState] = useState(null);
  function receiveStatus(data) {
    const fresh = { ...data, receivedAt: Date.now(), refreshing: Boolean(data.refreshing) };
    if (data.incident?.incident_id && !data.refreshing) incidentCache.current.remember(data.incident.incident_id, fresh);
    setIncidentState(fresh);
    setStatusError('');
    if (data.incident?.incident_id) setIncidents(old => old.map(item => item.incident_id === data.incident.incident_id ? data.incident : item));
  }
  const api = useCallback((path, options) => requestJson(config, path, options), [config]);
  async function loadIncidents(cursor = null) {
    setLoadingIncidents(true);
    try {
      const data = await api('/incidents' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
      setIdentity(data.household_id);
      if (!cursor && !data.items.length && !data.next_cursor) {
        if (activeIncident.current) incidentDeleted(activeIncident.current);
        setIncidents([]); incidentCache.current.clear();
      }
      if (!selectionMade.current && !activeIncident.current) {
        const open = data.items.filter(item => !item.resolved_at).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        if (open.length) selectIncident(open[0].incident_id, open[0]);
      }
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
  function clearDrafts(includeHistory = true) {
    if (includeHistory) {
      clearConversations(localStorage, identity);
      sessionStorage.removeItem('aenea-run-request-' + identity);
    }
    sessionStorage.removeItem('aenea-studio-' + identity);
    sessionStorage.removeItem('aenea-trigger-' + identity);
    setStudioEpoch(value => value + 1);
  }
  function incidentDeleted(id) {
    incidentCache.current.remove(id);
    try { localStorage.removeItem(conversationKey(identity, id)); } catch { /* Optional browser history. */ }
    sessionStorage.removeItem(`aenea-note-${identity}-${id}`);
    setIncidents(old => old.filter(item => item.incident_id !== id));
    if (selected === id) selectIncident('');
    try {
      const run = JSON.parse(sessionStorage.getItem('aenea-trigger-' + identity) || 'null');
      if (run?.incident === id) sessionStorage.removeItem('aenea-trigger-' + identity);
      const drafts = JSON.parse(sessionStorage.getItem('aenea-studio-' + identity) || '[]');
      if (drafts.some(row => row.payload?.incident_id === id)) clearDrafts(false);
      else setStudioEpoch(value => value + 1);
    } catch { clearDrafts(false); }
  }
  async function loadStatus(id, fresh = true, isActive = () => true) {
    if (!id) return;
    const latest = statusRequests.current.start();
    const current = () => latest() && isActive() && activeIncident.current === id;
    if (fresh) setIncidentState(old => old ? { ...old, refreshing: true, assessment_current: false } : old);
    try {
      const data = await api('/incidents/' + id + '/timeline?view=status', { fresh });
      if (current()) receiveStatus(data);
    } catch (failure) {
      if (!current()) return;
      if ([404, 410].includes(failure.status)) { incidentDeleted(id); return; }
      setStatusError(failure.message);
      setIncidentState(old => old ? { ...old, refreshing: true, assessment_current: false } : old);
      throw failure;
    }
  }
  async function loadEvidence(id, cursor = null) {
    if (!id) return;
    const latest = evidenceRequests.current.start();
    const current = () => latest() && activeIncident.current === id;
    setEvidenceBusy(true); setEvidenceError('');
    try {
      const data = await api('/incidents/' + id + '/timeline?view=records' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { fresh: !cursor });
      if (!current()) return;
      setTimeline(old => mergeEvidence(old, data.items, !!cursor));
      setTimelineCursor(data.next_cursor); setEvidenceReady(true);
    } catch (failure) { if (current()) setEvidenceError(failure.message); }
    finally { if (current()) setEvidenceBusy(false); }
  }
  useEffect(() => {
    (async () => {
      const result = await fetch('/config.json', { cache: 'no-store' });
      if (!result.ok) throw new Error('Deployment configuration is not available yet.');
      const value = await result.json();
      if (location.pathname === '/auth/callback') setAuthenticated(false);
      setConfig(value);
      await callback(value); setAuthenticated(hasSession());
      setPage(currentPage());
    })().catch(e => setError(e.message)).finally(() => { setPage(currentPage()); setBooting(false); });
    const onPop = () => { setPage(currentPage()); setSettingsTab(currentSettingsTab()); };
    const onExpired = () => { statusRequests.current.invalidate(); evidenceRequests.current.invalidate(); incidentCache.current.clear(); activeIncident.current = ''; setSelected(''); setIncidents([]); setIdentity(''); setCatalogReady(false); setCatalog({ revision: null, locations: [], devices: [] }); setIncidentState(null); setTimeline([]); setAuthenticated(false); setError('Your session has ended. Please sign in again.'); };
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
    if (!incidentPage) return;
    let active = true, running = false, cursor = null;
    const tick = async () => {
      if (running || document.hidden) return; running = true;
      try { const data = await api('/incidents' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
        if (!active) return;
        if (!cursor && !data.items.length && !data.next_cursor) {
          setIncidents([]); incidentCache.current.clear();
          if (activeIncident.current) incidentDeleted(activeIncident.current);
        }
        cursor = data.next_cursor;
        setIncidents(old => [...new Map([...old, ...data.items].map(item => [item.incident_id, item])).values()]);
        if (!selectionMade.current && !activeIncident.current) { const open = data.items.filter(item => !item.resolved_at).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); if (open.length) selectIncident(open[0].incident_id, open[0]); }
      } catch (failure) { if (active) setError(failure.message); } finally { running = false; }
    };
    const timer = setInterval(tick, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [config, authenticated, incidentPage]);
  useEffect(() => {
    if (!selected) sessionStorage.removeItem(incidentStorageKey);
    else sessionStorage.setItem(incidentStorageKey, selected);
  }, [selected]);
  useEffect(() => {
    if (!config || !selected || !authenticated || !incidentPage) return;
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.hidden) return;
      refreshing = true;
      try {
        await loadStatus(selected, false, () => active);
      } catch { /* The status lane keeps its own recoverable error. */ }
      finally { refreshing = false; }
    };
    refresh();
    const timer = setInterval(refresh, incidentState?.incident?.resolved_at ? 60000 : 10000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; statusRequests.current.invalidate(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [config, selected, authenticated, incidentPage, !!incidentState?.incident?.resolved_at]);
  function navigate(next, view = 'overview') {
    const target = ['check-in', 'handoff'].includes(next) ? 'incident-history' : next;
    const fragment = target === 'settings' && ['devices', 'cleanup'].includes(view) ? view : '';
    history.pushState(null, '', '/' + target + (fragment ? '#' + fragment : ''));
    setPage(target); setSettingsTab(target === 'settings' && fragment ? fragment : 'devices'); setError(''); setNotice('');
  }
  async function copyGuest(value, label) {
    try { await navigator.clipboard.writeText(value); setCopyNotice(label + ' copied.'); }
    catch { setCopyNotice('Copy is unavailable. Select the value manually.'); }
  }
  return <AppShell page={page} navigate={navigate} authenticated={authenticated} config={config}
    onAuth={async () => { try { if (authenticated) logout(config); else await login(config); } catch(e) { setError(e.message); } }}>
      {error && <div role="alert" className="error">{error}</div>}
      {notice && <div role="status" className="notice">{notice}</div>}
      {booting ? <section className="card workspace-loading" role="status" aria-live="polite"><h2>Opening your workspace…</h2><p>Connecting your session and loading Maple House.</p></section> : !config ? <section className="card"><h2>Workspace could not load</h2><button onClick={() => location.reload()}>Try again</button></section> : <>
      {authenticated && selected && incidentPage && statusError && <div role="alert" className="error">Current incident updates are unavailable. {statusError} <button onClick={() => loadStatus(selected).catch(() => {})}>Retry incident update</button></div>}
      {authenticated && selected && incidentPage && (!incidentState || incidentState.refreshing) && <p role="status" className="sync-status">{statusError ? 'Incident updates are temporarily unavailable. Retry to load the latest data.' : incidentState?.receivedAt ? 'Showing the saved view while checking for updates…' : 'Loading this incident’s latest signals…'}</p>}
      <Suspense fallback={<div className="card" role="status">Loading this view…</div>}>
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
      {authenticated && config && identity && studioMounted && <div id="device-alert-composer" key={studioEpoch} hidden={!['simulation-lab', 'command-center'].includes(page)}>
        <Suspense fallback={<div className="card" role="status">Loading Command Center…</div>}><SimulationStudio active={studioActive} key={identity} deviceSelection={deviceSelection} embedded={page === 'command-center'}
          map={<DeviceMap catalog={catalog} ready={catalogReady} timeline={timeline} state={incidentState} selected={selected} summary={incidents.find(item => item.incident_id === selected)} focusedDevice={deviceSelection} navigate={navigate} onDevice={setDeviceSelection}/>}
          briefing={<IncidentSummary picker={<IncidentPicker compact incidents={incidents} selected={selected} onSelect={selectIncident} busy={loadingIncidents} onRefresh={() => Promise.all([loadIncidents(), ...(selected ? [loadStatus(selected)] : [])]).catch(e => setError(e.message))} onMore={incidentCursor ? () => loadIncidents(incidentCursor).catch(e => setError(e.message)) : null}/>} key={selected} api={api} incident={selected} state={incidentState} timeline={timeline} navigate={navigate} onRefresh={() => loadStatus(selected)} onRenamed={() => loadIncidents()}/>}
          api={api} household={identity} catalog={catalog} ready={catalogReady && !catalogBusy} selected={selected} incidents={incidents} navigate={navigate} onBusy={setStudioBusy} onAccepted={id => {
          selectIncident(id); loadIncidents().catch(e => setError('Signal accepted; incident list refresh failed: ' + e.message));
        }}/></Suspense>
      </div>}
      {authenticated && config && page === 'settings' && <Settings initialTab={settingsTab} catalog={catalog} ready={catalogReady} busy={catalogBusy || studioBusy} save={saveCatalog} reload={loadCatalog} cleanup={<><DataControls api={api} incidents={incidents} onDeleted={incidentDeleted} onClearDrafts={clearDrafts} disabled={studioBusy}/>{incidentCursor && <button onClick={() => loadIncidents(incidentCursor).catch(error => setError(error.message))}>Load more incidents for cleanup</button>}</>}/>}
      {authenticated && config && page === 'incident-history' && <IncidentHistory api={api} incidents={incidents} catalog={catalog} selected={selected} onSelect={selectIncident} state={incidentState} timeline={timeline} loading={loadingIncidents}
        onRefreshList={() => loadIncidents().catch(e => setError(e.message))} onMoreIncidents={incidentCursor ? () => loadIncidents(incidentCursor).catch(e => setError(e.message)) : null}
        onRefresh={() => loadStatus(selected)} onRefreshEvidence={() => loadEvidence(selected)} evidenceReady={evidenceReady} evidenceBusy={evidenceBusy} evidenceError={evidenceError}
        onMoreEvidence={timelineCursor ? () => loadEvidence(selected, timelineCursor) : null}
        onDeleted={incidentDeleted} navigate={navigate}/>}
      {authenticated && config && page==='alexa-sim' && <AlexaSimulator household={identity} config={config} api={api} incidents={incidents} selected={selected} onSelect={selectIncident} state={incidentState} timeline={timeline} onRefresh={() => loadStatus(selected)} navigate={navigate} catalog={catalog}
        onViewDevice={id => { setDeviceSelection({ id, nonce: Date.now(), inspect: true }); navigate('command-center'); }} />}
      </Suspense>
      </>}
    </AppShell>;
}
createRoot(document.getElementById('root')).render(<App/>);
