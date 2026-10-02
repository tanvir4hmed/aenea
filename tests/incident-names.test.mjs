import test from 'node:test';
import assert from 'node:assert/strict';
import { incidentName, incidentLabel } from '../apps/web/src/incidentNames.js';

test('legacy hash labels become readable without rewriting saved identifiers', () => {
  const incident = { incident_id: 'f242c542', name: 'Incident F242C542', created_at: '2026-10-02T10:00:00Z', status: 'assessed' };
  assert.match(incidentName(incident), /^Report · /);
  assert.doesNotMatch(incidentLabel(incident), /f242c542/i);
  assert.equal(incident.incident_id, 'f242c542');
  assert.equal(incidentName(), 'Saved report');
  assert.equal(incidentName(null), 'Saved report');
  assert.match(incidentLabel(null), /Saved report/);
});

test('saved descriptive names and agent location names are preserved', () => {
  assert.equal(incidentName({ name: 'Home · Kitchen · Smoke' }), 'Home · Kitchen · Smoke');
  assert.equal(incidentName({ name: 'Incident at warehouse' }), 'Incident at warehouse');
  assert.equal(incidentName({ hazard_family: 'security' }), 'Security activity');
});
