import { deviceTypes } from './devices.js';

export function selectedSignals(items, ids, catalog) {
  const devices = new Map(catalog.devices.map(device => [device.id, device]));
  const seen = new Set(), rows = [];
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
  if (rows.length > 20) throw new Error('Select up to 20 distinct devices per batch.');
  return rows;
}

export function selectionForDevice(items, deviceId) {
  const related = items.filter(item => item.signals.some(signal => signal.deviceId === deviceId));
  const single = related.find(item => item.type === 'single' && item.signals.length === 1);
  return single ? [single.id] : related.length ? [related[0].id] : [];
}

export function alertStates(catalog, timeline, state, now = Date.now()) {
  const assessment = state?.latest_assessment?.assessment;
  const events = [...new Map([...timeline.filter(item => item.event).map(item => item.event),
    ...(state?.latest_assessment?.evidence_snapshot || [])].map(event => [event.event_id, event])).values()];
  const result = new Map(), smokeGroups = new Map();
  const urgent = state?.assessment_current && state?.incident?.decision_review !== 'rejected' && assessment?.severity === 'urgent';
  const cited = new Set(assessment?.evidence_ids || []);
  for (const event of events) {
    const device = catalog.devices.find(item => item.id === event.source?.source_id);
    if (!device) continue;
    const age = now - new Date(event.occurred_at).valueOf();
    const fresh = age >= -30000 && age <= 300000;
    if (!result.has(device.id)) result.set(device.id, { level: 'amber', reason: 'Evidence recorded' });
    if (fresh && urgent && cited.has(event.event_id)) result.set(device.id, { level: 'red', reason: 'Urgent assessment · cited device' });
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
