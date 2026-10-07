import test from 'node:test';
import assert from 'node:assert/strict';
import { requestJson } from '../apps/web/src/api.js';
import { createIncidentCache } from '../apps/web/src/incidentCache.js';
import { createRequestGate, mergeEvidence } from '../apps/web/src/incidentReads.js';

const config = { apiUrl: 'https://api.example', clientId: 'client', cognitoDomain: 'https://login.example' };
const token = signature => 'header.' + Buffer.from(JSON.stringify({ aud: config.apiUrl + '/mcp', client_id: config.clientId, token_use: 'access' })).toString('base64url') + '.' + signature;
function signIn() {
  const values = new Map([['aenea-session', JSON.stringify({ accessToken: token('old'), refreshToken: 'refresh',
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
    if (url.includes('/oauth2/token')) { refreshes++; return Response.json({ access_token: token('new'), expires_in: 900 }); }
    requests++;
    return options.headers.Authorization === 'Bearer ' + token('old') ? new Response('', { status: 401 }) : Response.json({ ok: true });
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
  assert.equal(fresh.assessment_current, true);
  cache.remember('two', fresh); cache.remember('three', fresh);
  assert.equal(cache.preview('one'), null);
  cache.remove('two'); assert.equal(cache.preview('two'), null);
  cache.clear(); assert.equal(cache.preview('three'), null);
});

test('post-mutation refresh bypasses an older read still in flight', async () => {
  signIn();
  const requests = [];
  globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ resolve, options }));
  const old = requestJson(config, '/status');
  await new Promise(resolve => setImmediate(resolve));
  const fresh = requestJson(config, '/status', { fresh: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.equal('fresh' in requests[1].options, false);
  requests[1].resolve(Response.json({ revision: 2 }));
  assert.equal((await fresh).revision, 2);
  requests[0].resolve(Response.json({ revision: 1 }));
  assert.equal((await old).revision, 1);
});

test('superseded reads and prior selection/session results cannot replace current state', () => {
  const status = createRequestGate(), evidence = createRequestGate();
  const oldStatus = status.start(), currentStatus = status.start(), currentEvidence = evidence.start();
  assert.equal(oldStatus(), false);
  assert.equal(currentStatus(), true);
  assert.equal(currentEvidence(), true);
  status.invalidate(); evidence.invalidate();
  assert.equal(currentStatus(), false);
  assert.equal(currentEvidence(), false);
  assert.equal(status.start()(), true);
});

test('evidence pagination deduplicates records independently of current incident state', () => {
  const first = [{ sk: 'EVENT#one', value: 1 }];
  assert.deepEqual(mergeEvidence(first, [{ sk: 'EVENT#one', value: 2 }, { sk: 'EVENT#two' }], true),
    [{ sk: 'EVENT#one', value: 2 }, { sk: 'EVENT#two' }]);
  assert.deepEqual(mergeEvidence(first, []), []);
  assert.equal(first[0].value, 1);
});
