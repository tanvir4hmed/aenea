import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedSignals, selectionForDevice, alertStates } from '../apps/web/src/simulations.js';

const device = (id, room = 'Kitchen', location_id = 'home') => ({ id, name: id, room, location_id, type: 'smoke_detector', connection: 'simulation', enabled: true });
const catalog = { devices: [device('one'), device('two'), device('three'), device('four', 'Bedroom')] };
const row = deviceId => ({ deviceId, kind: 'smoke', observation: '' });
const item = (id, signals) => ({ id, name: id, type: signals.length === 1 ? 'single' : 'scenario', signals });
const now = Date.parse('2026-09-25T12:00:00Z');
const event = (id, source = id, age = 1000) => ({ event: { event_id: id, source: { source_id: source }, kind: 'smoke', occurred_at: new Date(now - age).toISOString() } });

test('combines singles and multiple scenarios without losing device identity', () => {
  assert.equal(selectedSignals([item('a', [row('one')]), item('b', [row('two'), row('three')]), item('c', [row('four')])], ['a', 'b', 'c'], catalog).length, 4);
});
test('overlapping scenarios cannot send the same device twice', () => {
  assert.throws(() => selectedSignals([item('a', [row('one')]), item('b', [row('one'), row('two')])], ['a', 'b'], catalog), /more than once/);
});
test('removed and disabled devices cannot be triggered', () => {
  assert.throws(() => selectedSignals([item('a', [row('gone')])], ['a'], catalog), /unavailable/);
  assert.throws(() => selectedSignals([item('a', [row('one')])], ['a'], { devices: [{ ...device('one'), enabled: false }] }), /unavailable/);
});
test('multiple recent smoke devices escalate only the latest device in that room', () => {
  const states = alertStates(catalog, ['one', 'two', 'three', 'four'].map(id => event(id)), null, now);
  assert.equal(states.get('one').level, 'red');
  assert.equal(states.get('two').level, 'amber');
  assert.equal(states.get('three').level, 'amber');
  assert.equal(states.get('four').level, 'amber');
});
test('repeated signals from one device and stale reports do not cause red escalation', () => {
  const repeated = alertStates(catalog, [event('a', 'one'), event('b', 'one'), event('c', 'one')], null, now);
  assert.equal(repeated.get('one').level, 'amber');
  const stale = alertStates(catalog, [event('one'), event('two', 'two', 301000), event('three', 'three', 301000)], null, now);
  assert.equal(stale.get('one').level, 'amber');
});
test('same room names in different locations cannot combine', () => {
  const separate = { devices: [device('one'), device('two'), device('three', 'Kitchen', 'office')] };
  assert.equal(alertStates(separate, ['one', 'three'].map(id => event(id)), null, now).get('one').level, 'amber');
});
test('map device selection prefers its single alert, then a related scenario', () => {
  const entries = [item('scenario', [row('one'), row('two')]), item('single', [row('one')])];
  assert.deepEqual(selectionForDevice(entries, 'one'), ['single']);
  assert.deepEqual(selectionForDevice(entries, 'two'), ['scenario']);
  assert.deepEqual(selectionForDevice(entries, 'gone'), []);
});
test('current urgent assessment makes only cited devices red; stale assessment cannot', () => {
  const state = { assessment_current: true, incident: {}, latest_assessment: { assessment: { severity: 'urgent', evidence_ids: ['one'] } } };
  const events = [event('one'), event('four')];
  assert.equal(alertStates(catalog, events, state, now).get('one').level, 'red');
  assert.equal(alertStates(catalog, events, state, now).get('four').level, 'amber');
  assert.equal(alertStates(catalog, events, { ...state, assessment_current: false }, now).get('one').level, 'amber');
});
