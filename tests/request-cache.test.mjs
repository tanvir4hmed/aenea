import test from 'node:test';
import assert from 'node:assert/strict';
import { requestJson } from '../apps/web/src/api.js';
import { createIncidentCache } from '../apps/web/src/incidentCache.js';
import { canExecute } from '../apps/web/src/alexaConversation.js';

const config = { apiUrl: 'https://api.example', clientId: 'client', cognitoDomain: 'https://login.example' };
function signIn() {
  const values = new Map([['aenea-session', JSON.stringify({ accessToken: 'old', refreshToken: 'refresh',
    resource: config.apiUrl + '/mcp', expires: Date.now() + 900000, sessionExpires: Date.now() + 86400000 })]]);
  globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('concurrent GETs share transport, subsequent refresh still requests new data', async () => {
  signIn(); let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ version: requests }); };
  const results = await Promise.all([requestJson(config, '/incidents'), requestJson(config, '/incidents')]);
  assert.equal(requests, 1);
  assert.deepEqual(results, [{ version: 1 }, { version: 1 }]);
  assert.equal((await requestJson(config, '/incidents')).version, 2);
});

test('401 refreshes once; failed writes other than authorization are never replayed', async () => {
  signIn(); let requests = 0, refreshes = 0;
  globalThis.fetch = async (url, options) => {
    if (url.includes('/oauth2/token')) { refreshes++; return Response.json({ access_token: 'new', expires_in: 900 }); }
    requests++;
    return options.headers.Authorization === 'Bearer old' ? new Response('', { status: 401 }) : Response.json({ ok: true });
  };
  assert.deepEqual(await requestJson(config, '/notes', { method: 'POST', body: '{}' }), { ok: true });
  assert.equal(requests, 2); assert.equal(refreshes, 1);
  requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ error: 'Unavailable' }, { status: 503 }); };
  await assert.rejects(requestJson(config, '/notes', { method: 'POST', body: '{}' }), /503/);
  assert.equal(requests, 1);
});

test('incident previews are bounded and cannot authorize cached actions', () => {
  const cache = createIncidentCache(2);
  const fresh = { assessment_current: true, incident: { latest_assessment: 'a', event_count: 1 }, notes: {} };
  cache.remember('one', fresh);
  assert.equal(cache.preview('one').refreshing, true);
  assert.equal(canExecute({ assessment_id: 'a', evidence_revision: 1, expires_at: Date.now() / 1000 + 60 }, cache.preview('one')), false);
  assert.equal(fresh.assessment_current, true);
  cache.remember('two', fresh); cache.remember('three', fresh);
  assert.equal(cache.preview('one'), null);
  cache.remove('two'); assert.equal(cache.preview('two'), null);
  cache.clear(); assert.equal(cache.preview('three'), null);
});
