// Local component acceptance fixture only. No AWS calls or agent outcomes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import IncidentHistory from '../apps/web/src/IncidentHistory';
import AppShell from '../apps/web/src/AppShell';
import AlexaSimulator from '../apps/web/src/AlexaSimulator';
import SimulationStudio from '../apps/web/src/SimulationStudio';
import Settings from '../apps/web/src/Settings';
import ActionSettings from '../apps/web/src/ActionSettings';
import UserGuide from '../apps/web/src/UserGuide';
import DeviceMap from '../apps/web/src/DeviceMap';
import IncidentSummary from '../apps/web/src/IncidentSummary';
import '../apps/web/src/style.css';
import '../apps/web/src/experience.css';

const catalog = { revision: 'fixture', locations: [{ id: 'home', name: 'Example home', address: 'Fictional address' }], devices: [...[1, 2].map(index => ({ id: `sensor-${index}`, name: `Kitchen smoke detector ${index}`, type: 'smoke_detector', room: 'Kitchen', location_id: 'home', enabled: true, connection: 'simulation' })), { id: 'siren-1', name: 'Hall alarm', type: 'siren', room: 'Hall', location_id: 'home', enabled: true, connection: 'simulation' }] };
const incident = { incident_id: '11111111-1111-4111-8111-111111111111', name: 'Example home · kitchen smoke', location_id: 'home', created_at: '2026-09-30T09:00:00Z', event_count: 2, status: 'collecting_evidence' };
let library = { revision: null, items: [1, 2].map(index => ({ id: `single-${index}`, name: `Kitchen detector ${index}`, type: 'single', signals: [{ deviceId: `sensor-${index}`, kind: 'smoke', observation: 'Synthetic test input' }] })) };
let permissions = { revision: 'fixture', devices: { 'siren-1': { enabled: false, preauthorized: false, fail_next: false, name: 'Hall alarm', location_id: 'home', capability: 'virtual_siren', simulated: true } } };
async function api(path, options) {
  if (path === '/household/devices') { if (options) permissions = { ...JSON.parse(options.body), revision: crypto.randomUUID() }; return permissions; }
  if (path === '/household/simulations') { if (options) library = { ...JSON.parse(options.body), revision: crypto.randomUUID() }; return library; }
  if (path === '/household/runs') return options ? { id: 'test-run', status: 'running', names: ['LOCAL UI FIXTURE'], expected: 1, accepted: 0, incident_ids: [], created_at: Date.now() / 1000, message: 'UI fixture only; no signal sent' } : { items: [] };
  if (path.endsWith('/delete')) return { cleanup_status: 'queued' };
  if (path.endsWith('/name')) return { saved: true };
  if (path.endsWith('/notes')) return { saved: true };
  if (path.endsWith('/message')) {
    const { text } = JSON.parse(options.body);
    return { answer: /anybody|anyone|people|house/i.test(text) ? 'Occupancy is unconfirmed. Motion does not prove anyone is inside. [Local fixture response]' : 'Kitchen smoke detectors 1 and 2 reported smoke. [Local fixture response]', tool: 'get_incident_status', data: {} };
  }
  throw new Error('Local fixture: no cloud request performed');
}
function Preview() {
  const [settings, setSettings] = useState(catalog);
  const [page, setPage] = useState('alexa-sim'), [liveView, setLiveView] = useState('overview'), [selected, setSelected] = useState(incident.incident_id), [device, setDevice] = useState(null);
  function navigate(next, view = 'overview') { setPage(next); setLiveView(view); }
  const [items, setItems] = useState(() => Array.from({ length: 23 }, (_, index) => ({ ...incident, incident_id: index ? `fixture-${index}` : incident.incident_id, name: `Example home · incident ${index + 1}`, resolved_at: index % 2 ? 100 : null })));
  const current = items.find(item => item.incident_id === selected) || incident;
  const state = { household_id: 'ui-fixture', incident: current, receivedAt: Date.now(), active_devices: catalog.devices.filter(device => device.type === 'smoke_detector').map(device => ({ device_id: device.id, name: device.name, room: device.room, location_id: 'home', kind: 'smoke', alarm: 'active', connectivity: 'online', provenance: 'authenticated_simulator' })), canonical_severity: 'warning', notes: { items: [] }, actions: [{ action_id: 'legacy', proposal: { device_id: 'virtual_lights', action: 'lights_on' }, status: 'blocked', policy_reason: 'Virtual device is not enabled for this household' }], simulation_budget: { used: 0, limit: 2000, maximum: 10000 } };
  return <AppShell page={page} navigate={navigate} liveView={liveView} onLiveView={setLiveView} authenticated config={{}} selected={selected} selectedName={current.name} onAuth={() => {}}>
    <p className="notice">LOCAL UI FIXTURE — no cloud data or model results. Choose Command center, Simulation Studio or Alexa+.</p>
    {page === 'settings' ? <Settings catalog={settings} ready save={async next => setSettings(next)} reload={async () => {}} navigate={navigate} permissions={<ActionSettings api={api} catalog={settings} ready/>} cleanup={<p>Local fixture: no stored cloud data.</p>}/> : page === 'guide' ? <UserGuide navigate={navigate}/> : page === 'alexa-sim' ? <AlexaSimulator view={liveView} household="ui-fixture" navigate={navigate} catalog={catalog} config={{ apiUrl: '/fixture', clientId: 'fixture', cognitoDomain: 'fixture' }} api={api} incidents={items} selected={selected} onSelect={setSelected} state={state} timeline={[]} onRefresh={async () => {}}/> : page === 'incident-history' ?
      <IncidentHistory api={api} incidents={items} catalog={catalog} selected={selected} onSelect={setSelected} state={state} timeline={Array.from({ length: 23 }, (_, index) => ({ sk: `note-${index}`, kind: 'note', recorded_at: '2026-09-30T09:00:00Z', data: { text: `Fixture evidence ${index}` } }))} loading={false} onRefreshList={async () => {}} onRefresh={async () => {}} onDeleted={id => setItems(old => old.filter(item => item.incident_id !== id))} navigate={navigate}/> :
      <SimulationStudio key={page} api={api} household="ui-fixture" catalog={catalog} ready selected={selected} incidents={[incident]} onAccepted={setSelected} onBusy={() => {}} navigate={navigate} deviceSelection={device} embedded={page === 'command-center'}
        map={<DeviceMap catalog={catalog} ready timeline={[]} state={state} selected={selected} onDevice={setDevice} navigate={navigate}/>}
        briefing={<IncidentSummary api={api} incident={selected} state={state} timeline={[]} navigate={navigate} onRefresh={async () => {}} onRenamed={async () => {}}/>}/>}
  </AppShell>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
