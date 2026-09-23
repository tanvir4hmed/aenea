import test from 'node:test';
import assert from 'node:assert/strict';
import { commandFor, describe, canExecute } from '../apps/web/src/alexaConversation.js';

test('explicit commands allow aliases but never infer device approval', () => {
  assert.equal(commandFor(' What is happening?! ').tool, 'get_incident_status');
  assert.equal(commandFor('who is safe').tool, 'get_household_status');
  assert.equal(commandFor('yes close all valves'), undefined);
});
test('handoff response is not swallowed by an assessment summary', () => {
  const result = describe('get_responder_summary', { incident: { incident_id: 'incident-1' }, assessment: { assessment: { summary: 'Smoke' } }, partial: true, notice: 'Synthetic handoff.' });
  assert.match(result, /partial/); assert.match(result, /Nothing has been dispatched/);
});
test('action eligibility requires exact revision, current assessment and no rejection', () => {
  const action = { assessment_id: 'a', evidence_revision: 2, expires_at: 10 };
  const context = { assessment_current: true, incident: { latest_assessment: 'a', event_count: 2, decision_review: 'unreviewed' } };
  assert.equal(canExecute(action, context, 1000), true);
  assert.equal(canExecute(action, context, 10000), false);
  assert.equal(canExecute({ ...action, evidence_revision: 1 }, context, 1000), false);
  assert.equal(canExecute(action, { ...context, incident: { ...context.incident, decision_review: 'rejected' } }, 1000), false);
});
