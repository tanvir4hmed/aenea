export const deviceTypes = {
  smoke_detector: { label: 'Smoke detector', category: 'sensor', kinds: ['smoke'] },
  co_detector: { label: 'Carbon monoxide detector', category: 'sensor', kinds: ['carbon_monoxide'] },
  leak_sensor: { label: 'Water leak sensor', category: 'sensor', kinds: ['water_leak'] },
  camera: { label: 'Camera / doorbell', category: 'camera', kinds: ['motion', 'doorbell', 'package', 'vehicle'] },
  medical_button: { label: 'Medical alert button', category: 'sensor', kinds: ['medical_sos'] },
  weather_feed: { label: 'Weather feed', category: 'weather', kinds: ['severe_weather'] },
  heat_detector: { label: 'Heat detector', category: 'sensor', kinds: ['heat'] },
  gas_detector: { label: 'Gas leak detector', category: 'sensor', kinds: ['gas_leak'] },
  freeze_sensor: { label: 'Freeze / temperature sensor', category: 'sensor', kinds: ['freeze_risk'] },
  power_monitor: { label: 'Power monitor', category: 'sensor', kinds: ['power_outage'] },
  security_contact: { label: 'Door / window contact', category: 'sensor', kinds: ['contact_open', 'forced_entry'] },
  glass_break_sensor: { label: 'Glass-break sensor', category: 'sensor', kinds: ['glass_break'] },
  security_panel: { label: 'Security alarm panel', category: 'sensor', kinds: ['security_alarm', 'tamper'] },
  smart_lock: { label: 'Smart lock', category: 'sensor', kinds: ['lock_tamper'] },
  light: { label: 'Virtual light', category: 'actuator', kinds: [] },
  siren: { label: 'Virtual siren', category: 'actuator', kinds: [] },
  notification: { label: 'In-app notification', category: 'actuator', kinds: [] },
  water_valve: { label: 'Virtual water valve', category: 'actuator', kinds: [] },
};
export const signalPriorities = {
  doorbell: 'Notification only', motion: 'Notification only', package: 'Notification only', vehicle: 'Notification only', person_detected: 'Notification only', contact_open: 'Notification only',
  water_leak: 'Warning', severe_weather: 'Warning', freeze_risk: 'Warning', power_outage: 'Warning', tamper: 'Warning', lock_tamper: 'Warning',
  smoke: 'Critical', carbon_monoxide: 'Critical', heat: 'Critical', gas_leak: 'Critical', medical_sos: 'Critical', security_alarm: 'Critical', forced_entry: 'Critical', glass_break: 'Critical',
};
export const signalPriority = kind => signalPriorities[kind] || 'Needs review';
export const humanize = value => value.replaceAll('_', ' ');

export function signalPayload(draft, device, location, household, incident) {
  const type = deviceTypes[device.type];
  if (!device.enabled || device.connection !== 'simulation' || !type?.kinds.includes(draft.kind)) {
    throw new Error('This signal needs an enabled, compatible simulation device.');
  }
  return { incident_id: incident, contract_version: '1.1', state: { alarm: 'active', connectivity: 'online', ...(draft.severity && draft.severity !== 'auto' ? { simulated_severity: draft.severity } : {}) },
    adapter: type.category === 'camera' ? 'camera-simulator' : type.category === 'weather' ? 'webhook' : 'sensor',
    event: { event_id: crypto.randomUUID(), household_id: household, occurred_at: new Date().toISOString(),
      source: { source_id: device.id, category: type.category, simulated: true }, kind: draft.kind,
      observation: `[Simulation: ${location.name} / ${device.room || 'Unspecified room'} / ${device.name}] ${draft.observation}` } };
}
