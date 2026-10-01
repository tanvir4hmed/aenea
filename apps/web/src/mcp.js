import { accessToken, refreshAccessToken } from './auth.js';
import { rpcResult } from './mcpProtocol.js';

const protocol = '2025-11-25';
export function createMcpClient(config) {
  let initialized = false;
  let sessionId;
  let initializing;
  const pendingReports = new Map();
  async function request(method, params = {}, notification = false) {
    const id = notification ? undefined : crypto.randomUUID();
    const send = token => fetch(config.apiUrl + '/mcp', {
      method: 'POST', headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': protocol,
        ...(sessionId && method !== 'initialize' ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }),
    });
    let result = await send(await accessToken(config));
    if (result.status === 401) result = await send(await refreshAccessToken(config));
    if (!result.ok) {
      const expired = result.status === 404 && Boolean(sessionId);
      if (expired) { initialized = false; sessionId = undefined; }
      const error = new Error('MCP request failed (' + result.status + '). A write may have completed; check its status before retrying.');
      error.sessionExpired = expired;
      throw error;
    }
    sessionId = result.headers.get('mcp-session-id') || sessionId;
    if (notification) return null;
    const raw = await result.text();
    return rpcResult(raw, result.headers.get('content-type'), id);
  }
  async function initialize() {
    if (initialized) return;
    if (!initializing) initializing = (async () => {
      const hello = await request('initialize', { protocolVersion: protocol, capabilities: {},
        clientInfo: { name: 'aenea-alexa-web-simulator', version: '0.1.0' } });
      if (hello?.protocolVersion !== protocol) { sessionId = undefined; throw new Error('Required MCP protocol was not negotiated.'); }
      await request('notifications/initialized', {}, true);
      initialized = true;
    })().finally(() => { initializing = null; });
    return initializing;
  }
  return {
    async call(name, args) {
      const reportKey = name === 'report_person_status' ? JSON.stringify(args) : null;
      if (reportKey && !args.request_id) {
        if (!pendingReports.has(reportKey)) pendingReports.set(reportKey, crypto.randomUUID());
        args = { ...args, request_id: pendingReports.get(reportKey) };
      }
      await initialize();
      let result;
      try { result = await request('tools/call', { name, arguments: args }); }
      catch (error) {
        if (!error.sessionExpired) throw error;
        await initialize();
        // Recover the session, but never automatically replay an uncertain write.
        if (!['get_incident_status', 'get_incident_timeline', 'get_household_status', 'get_action_status', 'get_responder_summary'].includes(name)) throw error;
        result = await request('tools/call', { name, arguments: args });
      }
      if (result.isError) throw new Error(result.content?.find(x => x.type === 'text')?.text || 'Tool rejected.');
      const text = result.content?.find(x => x.type === 'text')?.text;
      const data = result.structuredContent || (text ? JSON.parse(text) : {});
      if (reportKey) pendingReports.delete(reportKey);
      return data;
    },
  };
}
