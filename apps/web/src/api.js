import { accessToken, refreshAccessToken } from './auth.js';

const pendingReads = new Map();

export async function requestJson(config, path, options = {}) {
  // Post-mutation refreshes must not reuse a read started before the mutation.
  const { fresh = false, ...requestOptions } = options;
  const token = await accessToken(config);
  const key = `${config.apiUrl}\n${token}\n${path}`;
  const read = !options.method || options.method === 'GET';
  if (read && !fresh && pendingReads.has(key)) return pendingReads.get(key);
  const request = (async () => {
    const send = bearer => fetch(config.apiUrl + path, { ...requestOptions, headers: {
      ...requestOptions.headers, Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json',
    } });
    let result = await send(token);
    // A 401 rejects authorization before the operation. Other failures are never replayed.
    if (result.status === 401) result = await send(await refreshAccessToken(config));
    let body;
    try { body = await result.json(); } catch { body = {}; }
    if (!result.ok) {
      const recovery = result.status === 401 ? ' Your sign-in is retained. Sign in again if this continues.'
        : read ? ' Refresh and try again.' : ' Check the saved result before retrying.';
      const failure = new Error(`${body.error || 'The request could not complete'} (${result.status}).${recovery}`);
      failure.status = result.status;
      throw failure;
    }
    return body;
  })();
  if (read) pendingReads.set(key, request);
  try { return await request; }
  finally { if (read && pendingReads.get(key) === request) pendingReads.delete(key); }
}
