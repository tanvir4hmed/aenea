import test from 'node:test';
import assert from 'node:assert/strict';
import { pageForPath } from '../apps/web/src/routes.js';

test('OAuth callback is a workspace route before token exchange completes', () => {
  assert.equal(pageForPath('/auth/callback'), 'alexa-sim');
  assert.equal(pageForPath('/auth/callback/'), 'alexa-sim');
  assert.equal(pageForPath('/'), 'alexa-sim');
});
test('legacy aliases resolve while unknown nested routes remain not found', () => {
  assert.equal(pageForPath('/handoff'), 'incident-history');
  assert.equal(pageForPath('/command-center/'), 'command-center');
  assert.equal(pageForPath('/command-center/unknown'), 'command-center/unknown');
});
