import test from 'node:test';
import assert from 'node:assert/strict';
import { accessToken, login, callback, logout, hasSession } from '../apps/web/src/auth.js';

const config = { apiUrl: 'https://api.example', cognitoDomain: 'https://login.example', clientId: 'client' };
const token = (signature = 'test', claims = {}) => 'header.' + Buffer.from(JSON.stringify({ aud: config.apiUrl + '/mcp', client_id: config.clientId, token_use: 'access', ...claims })).toString('base64url') + '.' + signature;
let values, redirected;
function setup(session = {}) {
  values = new Map([['aenea-session', JSON.stringify({ accessToken: token('old'), refreshToken: 'refresh', expires: 1,
    resource: config.apiUrl + '/mcp', sessionExpires: Date.now() + 86400000, ...session })]]);
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.sessionStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.location = { origin: 'https://aenea.example', pathname: '/command-center', search: '', assign: url => { redirected = url; } };
  globalThis.history = { replaceState: () => {} };
  globalThis.dispatchEvent = () => {};
  globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
}
test('PKCE login binds resource and callback stores that binding', async () => {
  setup(); await login(config);
  const url = new URL(redirected), saved = JSON.parse(values.get('aenea-oauth'));
  assert.equal(url.searchParams.get('resource'), config.apiUrl + '/mcp');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  location.pathname = '/auth/callback'; location.search = '?state=' + saved.state + '&code=code';
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.body.get('code_verifier'), saved.verifier);
    return Response.json({ access_token: token('new'), refresh_token: 'refresh', expires_in: 3600 });
  };
  await callback(config);
  assert.equal(JSON.parse(values.get('aenea-session')).resource, config.apiUrl + '/mcp');
  assert.equal(await accessToken(config), token('new'));
});
test('legacy sessions require one new login rather than bypassing audience validation', async () => {
  setup({ resource: undefined, expires: Date.now() + 3600000 });
  await assert.rejects(accessToken(config), /Sign in once again/);
  assert.equal(values.has('aenea-session'), false);
});
test('parallel requests share refresh and preserve refresh token and resource', async () => {
  setup(); let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ access_token: token('new'), expires_in: 3600 }); };
  assert.deepEqual(await Promise.all([accessToken(config), accessToken(config)]), [token('new'), token('new')]);
  assert.equal(calls, 1);
  const saved = JSON.parse(values.get('aenea-session'));
  assert.equal(saved.refreshToken, 'refresh'); assert.equal(saved.resource, config.apiUrl + '/mcp');
});
test('temporary token-service failure does not log the user out', async () => {
  setup(); globalThis.fetch = async () => new Response('', { status: 503 });
  await assert.rejects(accessToken(config), /temporarily unavailable/);
  assert.equal(values.has('aenea-session'), true);
});
test('invalid refresh token ends the session', async () => {
  setup(); globalThis.fetch = async () => new Response('', { status: 400 });
  await assert.rejects(accessToken(config), /session has ended/);
  assert.equal(values.has('aenea-session'), false);
});
test('logout during refresh cannot restore the old session', async () => {
  setup(); let finish;
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = accessToken(config);
  logout(config);
  finish(Response.json({ access_token: token('old-user-new-token'), expires_in: 3600 }));
  await assert.rejects(pending, /Sign-in changed/);
  assert.equal(values.has('aenea-session'), false);
});
test('a new tab retains the browser session and refresh does not extend its one-day deadline', async () => {
  const deadline = Date.now() + 3600000;
  setup({ sessionExpires: deadline });
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {}, setItem: () => {} };
  assert.equal(hasSession(), true);
  globalThis.fetch = async () => Response.json({ access_token: token('new'), expires_in: 900 });
  assert.equal(await accessToken(config), token('new'));
  assert.equal(JSON.parse(values.get('aenea-session')).sessionExpires, deadline);
});
test('the one-day deadline requires sign-in even if an access token remains valid', async () => {
  setup({ sessionExpires: Date.now() - 1, expires: Date.now() + 3600000 });
  assert.equal(hasSession(), false);
  globalThis.fetch = () => { throw Error('Expired sessions must not refresh'); };
  await assert.rejects(accessToken(config), /session has ended/);
  assert.equal(values.has('aenea-session'), false);
});

test('Classic-login or wrong-audience cached tokens require a new bound sign-in', async () => {
  for (const claims of [{ aud: undefined }, { aud: 'https://other.example/mcp' }, { token_use: 'id' }, { client_id: 'other' }]) {
    setup({ accessToken: token('invalid', claims), expires: Date.now() + 3600000 });
    await assert.rejects(accessToken(config), /resource-bound/);
    assert.equal(values.has('aenea-session'), false);
  }
});

test('refresh must preserve the actual token audience, not just cached resource metadata', async () => {
  setup();
  globalThis.fetch = async () => Response.json({ access_token: token('unbound', { aud: undefined }), expires_in: 900 });
  await assert.rejects(accessToken(config), /resource-bound/);
  assert.equal(values.has('aenea-session'), false);
});

test('callback rejects an unbound grant and accepts a matching audience array', async () => {
  setup(); await login(config);
  const saved = JSON.parse(values.get('aenea-oauth'));
  location.pathname = '/auth/callback'; location.search = '?state=' + saved.state + '&code=code';
  globalThis.fetch = async () => Response.json({ access_token: token('unbound', { aud: undefined }), expires_in: 900 });
  await assert.rejects(callback(config), /resource-bound/);
  assert.equal(values.has('aenea-session'), false);
  setup({ accessToken: token('array', { aud: [config.apiUrl + '/mcp'] }), expires: Date.now() + 3600000 });
  assert.equal(await accessToken(config), token('array', { aud: [config.apiUrl + '/mcp'] }));
});
