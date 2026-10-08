import test from 'node:test';
import assert from 'node:assert/strict';
import { roomInventory, appendRoomSignals, supportedKinds } from '../apps/web/src/simulationForm.js';
import { deviceTypes } from '../apps/web/src/devices.js';
const device = (id, room, type = 'smoke_detector') => ({ id, room, type, enabled: true, connection: 'simulation' });
const catalog = { devices: [device('k1', 'Kitchen'), device('k2', 'Kitchen', 'leak_sensor'), device('b1', 'Master Bedroom')] };
const scenario = { type: 'scenario', signals: [] };

test('simulation severity is independent of supported signal and survives definition creation', () => {
  const draft = appendRoomSignals(scenario, catalog, 'Kitchen', ['k1', 'k2'], {}, '', { k1: 'urgent', k2: 'warning' });
  assert.deepEqual(draft.signals.map(row => row.severity), ['urgent', 'warning']);
  assert.throws(() => appendRoomSignals(scenario, catalog, 'Kitchen', ['k1'], {}, '', { k1: 'safe' }));
});
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
test('signal choices preserve device capabilities without an alert-level filter', () => {
  assert.deepEqual(supportedKinds(catalog.devices[0]), ['smoke']);
  assert.deepEqual(supportedKinds(catalog.devices[1]), ['water_leak']);
  assert.throws(() => appendRoomSignals(scenario, catalog, 'Kitchen', ['k2'], { k2: 'smoke' }));
});

test('every supported signal on every sensor accepts each exercise severity', () => {
  for (const [type, definition] of Object.entries(deviceTypes)) {
    const source = device(type, 'Kitchen', type);
    const inventory = { devices: [source] };
    assert.deepEqual(supportedKinds(source), definition.kinds);
    if (!definition.kinds.length) {
      assert.equal(roomInventory(inventory, 'Kitchen', []).available.length, 0);
      continue;
    }
    const first = appendRoomSignals(scenario, inventory, 'Kitchen', [type], {});
    assert.equal(first.signals[0].kind, definition.kinds[0]);
    for (const kind of definition.kinds) {
      for (const severity of ['auto', 'informational', 'warning', 'urgent']) {
        const result = appendRoomSignals(scenario, inventory, 'Kitchen', [type], { [type]: kind }, '', { [type]: severity });
        assert.equal(result.signals[0].kind, kind);
        assert.equal(result.signals[0].severity || 'auto', severity);
      }
    }
  }
});
