// Local component acceptance fixture only. No AWS calls or agent outcomes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AppShell from '../apps/web/src/AppShell';
import AlexaSimulator from '../apps/web/src/AlexaSimulator';
import SimulationStudio from '../apps/web/src/SimulationStudio';
import DeviceMap, { IncidentBriefing } from '../apps/web/src/DeviceMap';
import '../apps/web/src/style.css';

const catalog = { revision: 'fixture', locations: [{ id: 'home', name: 'Example home', address: 'Fictional address' }], devices: [1, 2].map(index => ({ id: `sensor-${index}`, name: `Kitchen smoke detector ${index}`, type: 'smoke_detector', room: 'Kitchen', location_id: 'home', enabled: true, connection: 'simulation' })) };
const incident = { incident_id: '11111111-1111-4111-8111-111111111111', name: 'Example home · kitchen smoke', event_count: 2, status: 'collecting_evidence' };
let library = { revision: null, items: [1, 2].map(index => ({ id: `single-${index}`, name: `Kitchen detector ${index}`, type: 'single', signals: [{ deviceId: `sensor-${index}`, kind: 'smoke', observation: 'Synthetic test input' }] })) };
async function api(path, options) {
  if (path === '/household/simulations') { if (options) library = { ...JSON.parse(options.body), revision: crypto.randomUUID() }; return library; }
  if (path === '/household/runs') return options ? { id: 'test-run', status: 'running', names: ['LOCAL UI FIXTURE'], expected: 1, accepted: 0, incident_ids: [], created_at: Date.now() / 1000, message: 'UI fixture only; no signal sent' } : { items: [] };
  if (path.endsWith('/notes')) return { saved: true };
  throw new Error('Local fixture: no cloud request performed');
}
function Preview() {
  const [page, setPage] = useState('alexa-sim'), [selected, setSelected] = useState(incident.incident_id), [device, setDevice] = useState(null);
  const state = { household_id: 'ui-fixture', incident, receivedAt: Date.now(), active_devices: catalog.devices.map(device => ({ device_id: device.id, name: device.name, room: device.room, kind: 'smoke', alarm: 'active' })), canonical_severity: 'warning', notes: { items: [] }, actions: [] };
  return <AppShell page={page} navigate={setPage} authenticated config={{}} selected={selected} selectedName={incident.name} onSignOut={() => {}}>
    <p className="notice">LOCAL UI FIXTURE — no cloud data or model results. Choose Command center, Simulation Studio or Alexa+.</p>
    {page === 'alexa-sim' ? <AlexaSimulator config={{ apiUrl: '/fixture', clientId: 'fixture', cognitoDomain: 'fixture' }} api={api} incidents={[incident]} selected={selected} onSelect={setSelected} state={state} timeline={[]} onRefresh={async () => {}}/> :
      <SimulationStudio key={page} api={api} household="ui-fixture" catalog={catalog} ready selected={selected} incidents={[incident]} onAccepted={setSelected} onBusy={() => {}} navigate={setPage} deviceSelection={device} embedded={page === 'command-center'}
        map={<DeviceMap catalog={catalog} ready timeline={[]} state={state} selected={selected} onDevice={setDevice} navigate={setPage}/>}
        briefing={<IncidentBriefing state={state} selected={selected} timeline={[]} navigate={setPage}/>}/>}
  </AppShell>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
