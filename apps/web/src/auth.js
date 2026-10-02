import { clearConversations } from './alexaConversation.js';

const key = 'aenea-session';
const oauthKey = 'aenea-oauth';
const incidentKey = 'aenea-selected-incident';
const sessionDuration = 24 * 60 * 60 * 1000;
let refreshPromise;
let sessionGeneration = 0;
const resourceFor = config => config.apiUrl.replace(/\/$/, '') + '/mcp';

function savedSession() {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value?.sessionExpires > Date.now() ? value : null;
  }
  catch { return null; }
}

export function session() {
  const value = savedSession();
  return value?.accessToken && value.expires > Date.now() + 60_000 ? value : null;
}
export function hasSession() { return Boolean(savedSession()?.refreshToken || session()); }

export function expireSession() {
  sessionGeneration += 1;
  clearConversations(localStorage);
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
  sessionStorage.removeItem(incidentKey);
  dispatchEvent(new CustomEvent('aenea-auth-expired'));
}

async function refresh(config, value) {
  const generation = sessionGeneration;
  const result = await fetch(config.cognitoDomain + '/oauth2/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.clientId,
      refresh_token: value.refreshToken }) });
  if (generation !== sessionGeneration) throw new Error('Sign-in changed while refreshing. Please retry.');
  if (!result.ok) {
    if (result.status === 429 || result.status >= 500) throw new Error('Sign-in service temporarily unavailable. Please retry; your session is retained.');
    const error = new Error('Your session has ended. Please sign in again.');
    error.sessionEnded = true;
    throw error;
  }
  const tokens = await result.json();
  if (!tokens.access_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new Error('Invalid sign-in response. Please retry.');
  const next = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || value.refreshToken,
    expires: Date.now() + tokens.expires_in * 1000, resource: value.resource, sessionExpires: value.sessionExpires };
  if (next.sessionExpires <= Date.now() || localStorage.getItem(key) !== JSON.stringify(value)) throw new Error('Sign-in changed while refreshing. Please retry.');
  localStorage.setItem(key, JSON.stringify(next));
  return next;
}

async function refreshCurrent(config) {
  if (savedSession() && savedSession().resource !== resourceFor(config)) {
    expireSession();
    throw new Error('Sign in once again to enable resource-protected access. Your saved incidents are unchanged.');
  }
  const value = savedSession();
  if (!value?.refreshToken) { expireSession(); throw new Error('Your session has ended. Please sign in again.'); }
  if (!refreshPromise) refreshPromise = refresh(config, value).finally(() => { refreshPromise = null; });
  try { return await refreshPromise; }
  catch (error) {
    if (error.sessionEnded) expireSession();
    throw error;
  }
}

export async function accessToken(config) {
  if (savedSession() && savedSession().resource !== resourceFor(config)) {
    expireSession();
    throw new Error('Sign in once again to enable resource-protected access. Your saved incidents are unchanged.');
  }
  const active = session();
  if (active) return active.accessToken;
  return (await refreshCurrent(config)).accessToken;
}

export async function refreshAccessToken(config) {
  return (await refreshCurrent(config)).accessToken;
}

const b64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
export async function login(config) {
  sessionGeneration += 1;
  const verifier = b64(crypto.getRandomValues(new Uint8Array(48)));
  const state = crypto.randomUUID();
  sessionStorage.setItem(oauthKey, JSON.stringify({ verifier, state, resource: resourceFor(config) }));
  const challenge = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const query = new URLSearchParams({ client_id: config.clientId, response_type: 'code',
    redirect_uri: location.origin + '/auth/callback', scope: 'openid email aenea/read aenea/write',
    state, code_challenge: challenge, code_challenge_method: 'S256', resource: resourceFor(config) });
  location.assign(config.cognitoDomain + '/oauth2/authorize?' + query);
}
export async function callback(config) {
  if (location.pathname !== '/auth/callback') return;
  const query = new URLSearchParams(location.search);
  const saved = JSON.parse(sessionStorage.getItem(oauthKey) || 'null');
  history.replaceState(null, '', '/alexa-sim');
  sessionStorage.removeItem(oauthKey);
  if (!saved || saved.resource !== resourceFor(config) || query.get('state') !== saved.state || !query.get('code')) throw new Error('Sign-in could not be verified. Please sign in again.');
  const result = await fetch(config.cognitoDomain + '/oauth2/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId,
      code: query.get('code'), redirect_uri: location.origin + '/auth/callback', code_verifier: saved.verifier }) });
  if (!result.ok) throw new Error('Sign-in failed. Please retry.');
  const tokens = await result.json();
  if (!tokens.access_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new Error('Invalid sign-in response. Please sign in again.');
  sessionStorage.removeItem(key);
  localStorage.setItem(key, JSON.stringify({ accessToken: tokens.access_token, sessionExpires: Date.now() + sessionDuration,
    refreshToken: tokens.refresh_token, expires: Date.now() + tokens.expires_in * 1000, resource: saved.resource }));
}
export function logout(config) {
  sessionGeneration += 1;
  clearConversations(localStorage);
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
  sessionStorage.removeItem(incidentKey);
  location.assign(config.cognitoDomain + '/logout?' + new URLSearchParams({
    client_id: config.clientId, logout_uri: location.origin + '/command-center' }));
}
