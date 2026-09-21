const key = 'aenea-session';
export function session() {
  try {
    const value = JSON.parse(sessionStorage.getItem(key));
    return value && value.expires > Date.now() ? value : null;
  } catch { return null; }
}
const b64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
export async function login(config) {
  const verifier = b64(crypto.getRandomValues(new Uint8Array(48)));
  const state = crypto.randomUUID();
  sessionStorage.setItem('aenea-oauth', JSON.stringify({ verifier, state }));
  const challenge = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const query = new URLSearchParams({ client_id: config.clientId, response_type: 'code',
    redirect_uri: location.origin + '/auth/callback', scope: 'openid email aenea/read aenea/write',
    state, code_challenge: challenge, code_challenge_method: 'S256', resource: config.apiUrl + '/mcp' });
  location.assign(config.cognitoDomain + '/oauth2/authorize?' + query);
}
export async function callback(config) {
  if (location.pathname !== '/auth/callback') return;
  const query = new URLSearchParams(location.search);
  const saved = JSON.parse(sessionStorage.getItem('aenea-oauth') || 'null');
  history.replaceState(null, '', '/command-center');
  sessionStorage.removeItem('aenea-oauth');
  if (!saved || query.get('state') !== saved.state || !query.get('code')) throw new Error('Sign-in could not be verified. Please sign in again.');
  const result = await fetch(config.cognitoDomain + '/oauth2/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId,
      code: query.get('code'), redirect_uri: location.origin + '/auth/callback', code_verifier: saved.verifier,
      resource: config.apiUrl + '/mcp' }) });
  if (!result.ok) throw new Error('Sign-in failed. Please retry.');
  const tokens = await result.json();
  sessionStorage.setItem(key, JSON.stringify({ accessToken: tokens.access_token, expires: Date.now() + tokens.expires_in * 1000 }));
}
export function logout(config) {
  sessionStorage.removeItem(key);
  location.assign(config.cognitoDomain + '/logout?' + new URLSearchParams({
    client_id: config.clientId, logout_uri: location.origin + '/command-center' }));
}
