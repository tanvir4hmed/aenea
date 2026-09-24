import test from 'node:test';
import assert from 'node:assert/strict';
import { incidentBriefing, reportingDevices } from '../apps/web/src/commandCenter.js';

test('briefing never presents a superseded or rejected assessment as current', () => {
  const state = { incident: { incident_id: 'abc', decision_review: 'rejected' }, assessment_current: false,
    latest_assessment: { assessment: { summary: 'Smoke reported in Kitchen.' } } };
  assert.match(incidentBriefing(state, 'abc'), /Previous assessment/);
  assert.match(incidentBriefing(state, 'abc'), /rejected/);
  assert.match(incidentBriefing(state, 'abc'), /Smoke reported/);
});
test('missing context does not claim event acceptance or safety', () => {
  assert.match(incidentBriefing(null, 'abc'), /Waiting/);
  assert.doesNotMatch(incidentBriefing(null, 'abc'), /accepted|safe/i);
});
test('map retains reporting devices from assessment when timeline pages omit evidence', () => {
  const state = { latest_assessment: { evidence_snapshot: [{ source: { source_id: 'smoke' } }] } };
  assert.deepEqual([...reportingDevices([{ event: { source: { source_id: 'camera' } } }], state)], ['camera', 'smoke']);
});
