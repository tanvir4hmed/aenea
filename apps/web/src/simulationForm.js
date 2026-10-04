import { deviceTypes, signalPriority } from './devices.js';

export const alertLevels = ['Notification only', 'Warning', 'Critical'];
export const defaultProfile = { mode: 'on_change', interval_seconds: 60, duration_seconds: 300, alarm: 'active', connectivity: 'online', clear_at_end: false };
export const supportedKinds = device => deviceTypes[device?.type]?.kinds || [];
export const kindsAtLevel = (device, level) => supportedKinds(device).filter(kind => signalPriority(kind) === level);

export function roomInventory(catalog, room, signals) {
  const registered = catalog.devices.filter(device => room && device.room === room);
  const enabled = registered.filter(device => device.enabled && device.connection === 'simulation' && supportedKinds(device).length);
  const added = new Set(signals.map(signal => signal.deviceId));
  return { registered, enabled, available: enabled.filter(device => !added.has(device.id)), added: registered.filter(device => added.has(device.id)).length };
}

export function appendRoomSignals(draft, catalog, room, ids, kinds, observation = '') {
  if (!ids.length) throw new Error('Choose an available device in this room.');
  const available = roomInventory(catalog, room, draft.signals).available;
  if (new Set(ids).size !== ids.length) throw new Error('Each device can appear once.');
  if (draft.signals.length + ids.length > (draft.type === 'single' ? 1 : 200)) throw new Error('Choose Scenario to include multiple devices.');
  const additions = ids.map(id => {
    const device = available.find(item => item.id === id);
    if (!device) throw new Error('Device already added, unavailable, or outside the selected room.');
    const kind = kinds[id] || supportedKinds(device)[0];
    if (!supportedKinds(device).includes(kind)) throw new Error('Choose a supported alert for this device.');
    return { deviceId: id, kind, observation: observation.trim() };
  });
  return { ...draft, signals: [...draft.signals, ...additions] };
}
