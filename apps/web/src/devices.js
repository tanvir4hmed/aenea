export const deviceTypes = {
  smoke_detector: { label: 'Smoke detector', category: 'sensor', kinds: ['smoke'] },
  co_detector: { label: 'Carbon monoxide detector', category: 'sensor', kinds: ['carbon_monoxide'] },
  leak_sensor: { label: 'Water leak sensor', category: 'sensor', kinds: ['water_leak'] },
  camera: { label: 'Camera / doorbell', category: 'camera', kinds: ['motion', 'doorbell', 'package', 'vehicle'] },
  medical_button: { label: 'Medical alert button', category: 'sensor', kinds: ['medical_sos'] },
  weather_feed: { label: 'Weather feed', category: 'weather', kinds: ['severe_weather'] },
};
export const humanize = value => value.replaceAll('_', ' ');

export function signalPayload(draft, device, location, household, incident) {
  const type = deviceTypes[device.type];
  if (!device.enabled || device.connection !== 'simulation' || !type?.kinds.includes(draft.kind)) {
    throw new Error('This signal needs an enabled, compatible simulation device.');
  }
  return { incident_id: incident, adapter: type.category === 'camera' ? 'camera-simulator' : type.category === 'weather' ? 'webhook' : 'sensor',
    event: { event_id: crypto.randomUUID(), household_id: household, occurred_at: new Date().toISOString(),
      source: { source_id: device.id, category: type.category, simulated: true }, kind: draft.kind,
      observation: `[Simulation: ${location.name} / ${device.room || 'Unspecified room'} / ${device.name}] ${draft.observation}` } };
}
