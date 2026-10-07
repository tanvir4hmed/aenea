import { deviceTypes } from './devices.js';

export function selectedSignals(items, ids, catalog) {
  const devices = new Map(catalog.devices.map(device => [device.id, device]));
  const seen = new Set(), rows = [], sources = new Map();
  for (const id of ids) {
    const item = items.find(item => item.id === id);
    for (const signal of item?.signals || []) sources.set(signal.deviceId, [...(sources.get(signal.deviceId) || []), item.name]);
  }
  const conflicts = [...sources].filter(([, names]) => names.length > 1);
  if (conflicts.length) throw new Error(conflicts.map(([id, names]) => `${devices.get(id)?.name || id} appears more than once: ${names.join(' + ')}`).join('; '));
  for (const id of ids) {
    const item = items.find(item => item.id === id);
    if (!item) throw new Error('A selected simulation was removed. Select it again.');
    for (const signal of item.signals) {
      const device = devices.get(signal.deviceId);
      if (!device || !device.enabled || device.connection !== 'simulation') throw new Error(`${device?.name || 'A saved device'} is unavailable. Edit the simulation in Studio.`);
      if (!deviceTypes[device.type]?.kinds.includes(signal.kind)) throw new Error(`${device.name} does not support this signal.`);
      if (seen.has(device.id)) throw new Error(`${device.name} appears more than once. Remove an overlapping selection; each device can send once per batch.`);
      seen.add(device.id); rows.push(signal);
    }
  }
  if (rows.length > 200) throw new Error('Select up to 200 distinct devices per run.');
  return rows;
}

export function selectionForDevice(items, deviceId) {
  const related = items.filter(item => item.signals.some(signal => signal.deviceId === deviceId));
  const single = related.find(item => item.type === 'single' && item.signals.length === 1);
  return single ? [single.id] : related.length ? [related[0].id] : [];
}

export function alertStates(catalog, timeline, state, now = Date.now()) {
  if (state?.active_devices) return new Map(state.active_devices.map(device => [device.device_id, { level: device.level, reason: `${device.kind.replaceAll('_', ' ')} · ${device.alarm}` }]));
  const assessment = state?.latest_assessment?.assessment;
  const events = [...new Map([...timeline.filter(item => item.event).map(item => item.event),
    ...(state?.latest_assessment?.evidence_snapshot || [])].map(event => [event.event_id, event])).values()];
  const result = new Map(), smokeGroups = new Map();
  const contexts = new Map(timeline.filter(item => item.event).map(item => [item.event.event_id, item.event_context]));
  for (const event of events) {
    const device = catalog.devices.find(item => item.id === event.source?.source_id);
    if (!device) continue;
    const age = now - new Date(event.occurred_at).valueOf();
    const fresh = age >= -30000 && age <= 300000;
    const context = contexts.get(event.event_id);
    const exercise = event.source.simulated === true && context?.provenance === 'authenticated_simulator' ? context.state?.simulated_severity : undefined;
    if (['informational', 'warning', 'urgent'].includes(exercise)) {
      const level = context.state.alarm === 'clear' ? 'normal' : exercise === 'urgent' ? 'red' : exercise === 'warning' ? 'amber' : 'normal';
      result.set(device.id, { level, reason: `Simulation ${exercise} · ${context.state.alarm}` });
      continue;
    }
    if (!result.has(device.id)) result.set(device.id, { level: 'amber', reason: 'Evidence recorded' });
    if (fresh && event.kind === 'smoke' && device.room?.trim()) {
      const key = `${device.location_id}/${device.room.trim().toLowerCase()}`;
      if (!smokeGroups.has(key)) smokeGroups.set(key, new Map());
      const previous = smokeGroups.get(key).get(device.id);
      if (!previous || new Date(event.occurred_at) > new Date(previous.occurred_at)) smokeGroups.get(key).set(device.id, event);
    }
  }
  for (const group of smokeGroups.values()) if (group.size >= 2) {
    const [latestDevice] = [...group.entries()].sort((a, b) => new Date(b[1].occurred_at) - new Date(a[1].occurred_at))[0];
    result.set(latestDevice, { level: 'red', reason: `${group.size} smoke detectors reporting in this room · simulated escalation` });
  }
  return result;
}
