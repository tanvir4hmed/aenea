import test from 'node:test';
import assert from 'node:assert/strict';
import { rpcResult } from '../apps/web/src/mcpProtocol.js';
import { createMcpClient } from '../apps/web/src/mcp.js';

const config = { apiUrl: 'https://api.example', cognitoDomain: 'https://login.example', clientId: 'client' };
function session() {
  const values = new Map([['aenea-session', JSON.stringify({ accessToken: 'test', expires: Date.now() + 600000,
    resource: config.apiUrl + '/mcp', sessionExpires: Date.now() + 86400000 })]]);
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.sessionStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function rpc(id, result, headers = {}) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'content-type': 'application/json', ...headers } });
}

test('SSE ignores priming data and comments and matches the response ID', () => {
  const raw = ': ping\r\n\r\nid: prime\r\ndata:\r\n\r\ndata: {"jsonrpc":"2.0","method":"notification"}\n\n' +
    'data: {"jsonrpc":"2.0",\ndata: "id":"one","result":{"ok":true}}\n\n';
  assert.deepEqual(rpcResult(raw, 'text/event-stream', 'one'), { ok: true });
});
test('JSON errors, unsupported content and incomplete streams do not imply success', () => {
  assert.throws(() => rpcResult('{"jsonrpc":"2.0","id":1,"error":{"message":"Denied"}}', 'application/json', 1), /Denied/);
  assert.throws(() => rpcResult('data:\n\n', 'text/event-stream', 1), /incomplete/);
  assert.throws(() => rpcResult('{}', 'text/html', 1), /Unsupported/);
});
test('concurrent calls share initialization and use its session', async () => {
  session();
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body.method);
    if (body.method === 'initialize') return rpc(body.id, { protocolVersion: '2025-11-25' }, { 'mcp-session-id': 's1' });
    assert.equal(options.headers['Mcp-Session-Id'], 's1');
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return rpc(body.id, { structuredContent: { ok: true } });
  };
  const client = createMcpClient(config);
  assert.deepEqual(await Promise.all([client.call('get_incident_status', {}), client.call('get_incident_timeline', {})]), [{ ok: true }, { ok: true }]);
  assert.equal(calls.filter(method => method === 'initialize').length, 1);
});
test('expired session reinitializes but never replays a write automatically', async () => {
  session();
  let initializes = 0, writes = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === 'initialize') {
      initializes++; assert.equal(options.headers['Mcp-Session-Id'], undefined);
      return rpc(body.id, { protocolVersion: '2025-11-25' }, { 'mcp-session-id': 's' + initializes });
    }
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    writes++; return new Response('', { status: 404 });
  };
  await assert.rejects(createMcpClient(config).call('confirm_action', {}), /404/);
  assert.equal(initializes, 2); assert.equal(writes, 1);
});
test('protocol mismatch prevents tool execution', async () => {
  session();
  let calls = 0;
  globalThis.fetch = async (_url, options) => { calls++; return rpc(JSON.parse(options.body).id, { protocolVersion: 'unsupported' }); };
  await assert.rejects(createMcpClient(config).call('get_incident_status', {}), /not negotiated/);
  assert.equal(calls, 1);
});
test('expired read session retries the read once with a new session', async () => {
  session(); let initializes = 0, reads = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === 'initialize') return rpc(body.id, { protocolVersion: '2025-11-25' }, { 'mcp-session-id': 's' + (++initializes) });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (++reads === 1) return new Response('', { status: 404 });
    assert.equal(options.headers['Mcp-Session-Id'], 's2');
    return rpc(body.id, { structuredContent: { recovered: true } });
  };
  assert.deepEqual(await createMcpClient(config).call('get_incident_status', {}), { recovered: true });
  assert.equal(initializes, 2); assert.equal(reads, 2);
});
