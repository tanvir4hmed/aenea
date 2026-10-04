import test from 'node:test';
import assert from 'node:assert/strict';
import { roomInventory, appendRoomSignals, kindsAtLevel, alertLevels } from '../apps/web/src/simulationForm.js';
const device = (id, room, type = 'smoke_detector') => ({ id, room, type, enabled: true, connection: 'simulation' });
const catalog = { devices: [device('k1', 'Kitchen'), device('k2', 'Kitchen', 'leak_sensor'), device('b1', 'Master Bedroom')] };
const scenario = { type: 'scenario', signals: [] };
test('room selection exposes only installed devices in that room', () => {
  assert.deepEqual(roomInventory(catalog, 'Kitchen', []).available.map(d => d.id), ['k1', 'k2']);
  assert.equal(roomInventory(catalog, '', []).available.length, 0);
  assert.equal(roomInventory(catalog, 'Garage', []).registered.length, 0);
});
test('scenario adds multiple devices and removes them from availability', () => {
  const draft = appendRoomSignals(scenario, catalog, 'Kitchen', ['k1', 'k2'], {});
  const inventory = roomInventory(catalog, 'Kitchen', draft.signals);
  assert.equal(draft.signals.length, 2); assert.equal(inventory.added, 2); assert.equal(inventory.available.length, 0);
  assert.throws(() => appendRoomSignals(draft, catalog, 'Kitchen', ['k1'], {}));
});
test('cross-room picks, duplicate IDs and multiple single-alert devices are rejected', () => {
  assert.throws(() => appendRoomSignals(scenario, catalog, 'Kitchen', ['b1'], {}));
  assert.throws(() => appendRoomSignals(scenario, catalog, 'Kitchen', ['k1', 'k1'], {}));
  assert.throws(() => appendRoomSignals({ type: 'single', signals: [] }, catalog, 'Kitchen', ['k1', 'k2'], {}));
});
test('three levels preserve real device capabilities', () => {
  assert.equal(alertLevels.length, 3);
  assert.deepEqual(kindsAtLevel(catalog.devices[0], 'Critical'), ['smoke']);
  assert.deepEqual(kindsAtLevel(catalog.devices[1], 'Critical'), []);
  assert.throws(() => appendRoomSignals(scenario, catalog, 'Kitchen', ['k2'], { k2: 'smoke' }));
});
