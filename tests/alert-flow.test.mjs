import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryRows } from '../apps/web/src/signalQueue.js';
import { incidentLabel } from '../apps/web/src/incidentNames.js';

test('direct alert does not deliver previously staged scenario signals', () => {
  const queue = [{ id: 'staged', checked: true, status: 'draft' }, { id: 'direct', checked: true, status: 'draft' }];
  assert.deepEqual(deliveryRows(queue, 'direct').map(row => row.id), ['direct']);
});
test('retry preserves payload identity and skips accepted signals', () => {
  const payload = { incident_id: 'same', incident_name: 'Kitchen smoke', event: { event_id: 'stable' } };
  const queue = [{ id: 'done', checked: true, status: 'accepted' }, { id: 'retry', checked: true, status: 'retry', payload }, { id: 'later', checked: true, status: 'draft' }];
  const rows = deliveryRows(queue, null, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload, payload);
});
test('incident options show saved name, date and lifecycle status', () => {
  const text = incidentLabel({ name: 'Drawing room leak', status: 'collecting_evidence', created_at: '2026-09-24T12:00:00Z' });
  assert.match(text, /Drawing room leak/);
  assert.match(text, /collecting evidence/);
  assert.match(text, /24/);
});
