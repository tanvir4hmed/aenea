import test from 'node:test';
import assert from 'node:assert/strict';
import { commandFor, describe } from '../apps/web/src/alexaConversation.js';

test('explicit commands allow aliases but never infer device approval', () => {
  assert.equal(commandFor(' What is happening?! ').tool, 'get_incident_status');
  assert.equal(commandFor('who is safe'), undefined);
  assert.equal(commandFor('yes close all valves'), undefined);
});
test('handoff response is not swallowed by an assessment summary', () => {
  const result = describe('get_responder_summary', { incident: { incident_id: 'incident-1' }, assessment: { assessment: { summary: 'Smoke' } }, partial: true, notice: 'Synthetic handoff.' });
  assert.match(result, /partial/); assert.match(result, /Nothing has been dispatched/);
});
