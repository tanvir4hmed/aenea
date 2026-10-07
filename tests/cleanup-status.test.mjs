import test from 'node:test';
import assert from 'node:assert/strict';
import { unfinishedCleanupRequests } from '../apps/web/src/cleanupStatus.js';

test('completed cleanup markers are hidden without mutating stored records', () => {
  const rows = Object.freeze([
    Object.freeze({ incident_id: 'done', cleanup_status: 'completed' }),
    Object.freeze({ incident_id: 'pending', cleanup_status: 'pending' }),
    Object.freeze({ incident_id: 'retry', cleanup_status: 'retrying' }),
    Object.freeze({ incident_id: 'failed', cleanup_status: 'failed' }),
  ]);
  assert.deepEqual(unfinishedCleanupRequests(rows).map(row => row.incident_id), ['pending', 'retry', 'failed']);
  assert.equal(rows.length, 4);
});

test('all-completed and empty results have no visible cleanup requests', () => {
  assert.deepEqual(unfinishedCleanupRequests([{ cleanup_status: 'completed' }]), []);
  assert.deepEqual(unfinishedCleanupRequests([]), []);
});
