const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const kinds = { smoke: 'Smoke detector', carbon_monoxide: 'Carbon monoxide detector', water_leak: 'Water leak sensor', motion: 'Motion sensor', doorbell: 'Doorbell', medical_sos: 'Medical alert button', severe_weather: 'Weather feed' };
const humanName = (value, id) => typeof value === 'string' && value.trim() && value !== id && !value.match(uuid) ? value.trim() : '';
export const readableText = value => String(value || '').replace(uuid, 'device record').replaceAll('_', ' ');
export function signalDetails(device, catalog, timeline = []) {
  const context = timeline.find(item => item.event?.event_id === device.event_id)?.event_context;
  const registered = catalog?.devices?.find(item => item.id === device.device_id);
  const recordedName = humanName(context?.device?.name, device.device_id) || humanName(device.name, device.device_id);
  const displayName = humanName(device.display_name, device.device_id);
  const catalogName = humanName(registered?.name, device.device_id);
  const currentName = !recordedName && (device.display_name_source === 'current_catalog' || !!catalogName);
  const name = recordedName || displayName || catalogName || kinds[device.kind] || `${readableText(device.kind) || 'Device'} signal`;
  const room = context?.device?.room || device.room;
  const location = context?.location?.name || device.location_name;
  const place = [room, location].filter(Boolean).join(' · ') || 'Location not recorded in this report';
  return { name, place, currentName, missingContext: !room && !location };
}
