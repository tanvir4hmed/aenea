import test from 'node:test';
import assert from 'node:assert/strict';
import { signalPayload } from '../apps/web/src/devices.js';

const device = { id: 'device-1', name: 'Kitchen smoke', room: 'Kitchen', type: 'smoke_detector', enabled: true, connection: 'simulation' };
const draft = { kind: 'smoke', observation: 'Synthetic smoke detected' };
test('signal captures stable device identity and location context', () => {
  const result = signalPayload(draft, device, { name: 'House A' }, 'owner', 'incident');
  assert.equal(result.event.source.source_id, 'device-1');
  assert.equal(result.event.household_id, 'owner');
  assert.match(result.event.observation, /House A \/ Kitchen \/ Kitchen smoke/);
  assert.equal(result.event.source.simulated, true);
});
test('replay generates fresh event identities', () => {
  const make = () => signalPayload(draft, device, { name: 'House A' }, 'owner', 'incident');
  assert.notEqual(make().event.event_id, make().event.event_id);
});
test('disabled or incompatible devices cannot generate a signal', () => {
  assert.throws(() => signalPayload(draft, { ...device, enabled: false }, {}, 'owner', 'incident'));
  assert.throws(() => signalPayload({ ...draft, kind: 'motion' }, device, {}, 'owner', 'incident'));
});
