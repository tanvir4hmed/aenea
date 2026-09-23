const key = 'aenea-session';
const oauthKey = 'aenea-oauth';
const incidentKey = 'aenea-selected-incident';
let refreshPromise;

function savedSession() {
  try { return JSON.parse(sessionStorage.getItem(key)); }
  catch { return null; }
}

export function session() {
  const value = savedSession();
  return value?.accessToken && value.expires > Date.now() + 60_000 ? value : null;
}
export function hasSession() { return Boolean(savedSession()?.refreshToken || session()); }

export function expireSession() {
  sessionStorage.removeItem(key);
  sessionStorage.removeItem(incidentKey);
  dispatchEvent(new CustomEvent('aenea-auth-expired'));
}

async function refresh(config, value) {
  const result = await fetch(config.cognitoDomain + '/oauth2/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.clientId,
      refresh_token: value.refreshToken }) });
  if (!result.ok) {
    const error = new Error('Your session has ended. Please sign in again.');
    error.sessionEnded = true;
    throw error;
  }
  const tokens = await result.json();
  const next = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || value.refreshToken,
    expires: Date.now() + tokens.expires_in * 1000 };
  sessionStorage.setItem(key, JSON.stringify(next));
  return next;
}

export async function accessToken(config) {
  const active = session();
  if (active) return active.accessToken;
  const value = savedSession();
  if (!value?.refreshToken) { expireSession(); throw new Error('Your session has ended. Please sign in again.'); }
  if (!refreshPromise) refreshPromise = refresh(config, value).finally(() => { refreshPromise = null; });
  try { return (await refreshPromise).accessToken; }
  catch (error) {
    if (error.sessionEnded) expireSession();
    throw error;
  }
}

const b64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
export async function login(config) {
  const verifier = b64(crypto.getRandomValues(new Uint8Array(48)));
  const state = crypto.randomUUID();
  sessionStorage.setItem(oauthKey, JSON.stringify({ verifier, state }));
  const challenge = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const query = new URLSearchParams({ client_id: config.clientId, response_type: 'code',
    redirect_uri: location.origin + '/auth/callback', scope: 'openid email aenea/read aenea/write',
    state, code_challenge: challenge, code_challenge_method: 'S256' });
  location.assign(config.cognitoDomain + '/oauth2/authorize?' + query);
}
export async function callback(config) {
  if (location.pathname !== '/auth/callback') return;
  const query = new URLSearchParams(location.search);
  const saved = JSON.parse(sessionStorage.getItem(oauthKey) || 'null');
  history.replaceState(null, '', '/command-center');
  sessionStorage.removeItem(oauthKey);
  if (!saved || query.get('state') !== saved.state || !query.get('code')) throw new Error('Sign-in could not be verified. Please sign in again.');
  const result = await fetch(config.cognitoDomain + '/oauth2/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId,
      code: query.get('code'), redirect_uri: location.origin + '/auth/callback', code_verifier: saved.verifier }) });
  if (!result.ok) throw new Error('Sign-in failed. Please retry.');
  const tokens = await result.json();
  sessionStorage.setItem(key, JSON.stringify({ accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token, expires: Date.now() + tokens.expires_in * 1000 }));
}
export function logout(config) {
  sessionStorage.removeItem(key);
  sessionStorage.removeItem(incidentKey);
  location.assign(config.cognitoDomain + '/logout?' + new URLSearchParams({
    client_id: config.clientId, logout_uri: location.origin + '/command-center' }));
}
