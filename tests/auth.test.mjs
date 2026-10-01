import test from 'node:test';
import assert from 'node:assert/strict';
import { accessToken, login, callback, logout, hasSession } from '../apps/web/src/auth.js';

const config = { apiUrl: 'https://api.example', cognitoDomain: 'https://login.example', clientId: 'client' };
let values, redirected;
function setup(session = {}) {
  values = new Map([['aenea-session', JSON.stringify({ accessToken: 'old', refreshToken: 'refresh', expires: 1,
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
    return Response.json({ access_token: 'new', refresh_token: 'refresh', expires_in: 3600 });
  };
  await callback(config);
  assert.equal(JSON.parse(values.get('aenea-session')).resource, config.apiUrl + '/mcp');
  assert.equal(await accessToken(config), 'new');
});
test('legacy sessions require one new login rather than bypassing audience validation', async () => {
  setup({ resource: undefined, expires: Date.now() + 3600000 });
  await assert.rejects(accessToken(config), /Sign in once again/);
  assert.equal(values.has('aenea-session'), false);
});
test('parallel requests share refresh and preserve refresh token and resource', async () => {
  setup(); let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ access_token: 'new', expires_in: 3600 }); };
  assert.deepEqual(await Promise.all([accessToken(config), accessToken(config)]), ['new', 'new']);
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
  finish(Response.json({ access_token: 'old-user-new-token', expires_in: 3600 }));
  await assert.rejects(pending, /Sign-in changed/);
  assert.equal(values.has('aenea-session'), false);
});
test('a new tab retains the browser session and refresh does not extend its one-day deadline', async () => {
  const deadline = Date.now() + 3600000;
  setup({ sessionExpires: deadline });
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {}, setItem: () => {} };
  assert.equal(hasSession(), true);
  globalThis.fetch = async () => Response.json({ access_token: 'new', expires_in: 900 });
  assert.equal(await accessToken(config), 'new');
  assert.equal(JSON.parse(values.get('aenea-session')).sessionExpires, deadline);
});
test('the one-day deadline requires sign-in even if an access token remains valid', async () => {
  setup({ sessionExpires: Date.now() - 1, expires: Date.now() + 3600000 });
  assert.equal(hasSession(), false);
  globalThis.fetch = () => { throw Error('Expired sessions must not refresh'); };
  await assert.rejects(accessToken(config), /session has ended/);
  assert.equal(values.has('aenea-session'), false);
});
