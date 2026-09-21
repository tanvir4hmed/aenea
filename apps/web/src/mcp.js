import { session } from './auth';

const protocol = '2025-11-25';
export function createMcpClient(apiUrl) {
  let initialized = false;
  let sessionId;
  async function request(method, params = {}, notification = false) {
    const credentials = session();
    if (!credentials) throw new Error('Sign in to connect to your household.');
    const id = notification ? undefined : crypto.randomUUID();
    const result = await fetch(apiUrl + '/mcp', {
      method: 'POST', headers: {
        Authorization: 'Bearer ' + credentials.accessToken,
        'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': protocol,
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }),
    });
    if (!result.ok) {
      if (result.status === 404) { initialized = false; sessionId = undefined; }
      throw new Error('MCP request failed (' + result.status + '). A write may have completed; check its status before retrying.');
    }
    sessionId = result.headers.get('mcp-session-id') || sessionId;
    if (notification || result.status === 202) return null;
    const raw = await result.text();
    let messages;
    if (result.headers.get('content-type')?.includes('text/event-stream')) {
      messages = raw.split(/\r?\n\r?\n/).filter(block => block.includes('data:'))
        .map(block => JSON.parse(block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')));
    } else messages = [JSON.parse(raw)];
    const body = messages.find(message => message.id === id);
    if (!body) throw new Error('Missing MCP response.');
    if (body.error) throw new Error(body.error.message || 'MCP protocol error');
    return body.result;
  }
  return {
    async call(name, args) {
      if (!initialized) {
        const hello = await request('initialize', { protocolVersion: protocol, capabilities: {},
          clientInfo: { name: 'aenea-alexa-web-simulator', version: '0.1.0' } });
        if (hello.protocolVersion !== protocol) throw new Error('Required MCP protocol was not negotiated.');
        await request('notifications/initialized', {}, true);
        initialized = true;
      }
      const result = await request('tools/call', { name, arguments: args });
      if (result.isError) throw new Error(result.content?.find(x => x.type === 'text')?.text || 'Tool rejected.');
      if (result.structuredContent) return result.structuredContent;
      const text = result.content?.find(x => x.type === 'text')?.text;
      return text ? JSON.parse(text) : {};
    },
  };
}
