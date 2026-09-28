// The deployed stateless proxy returns a bounded JSON or finite SSE response.
export function rpcResult(raw, contentType, id) {
  let messages;
  if (contentType?.includes('text/event-stream')) {
    messages = raw.split(/\r\n|\r|\n/).join('\n').split('\n\n').flatMap(block => {
      const data = block.split('\n').filter(line => line === 'data' || line.startsWith('data:'))
        .map(line => line === 'data' ? '' : line.slice(5).replace(/^ /, '')).join('\n');
      // Empty data primes SSE reconnection; comments/heartbeats are not JSON.
      return data.trim() ? [JSON.parse(data)] : [];
    });
  } else if (contentType?.includes('application/json')) messages = [JSON.parse(raw)];
  else throw new Error('Unsupported MCP response format.');
  const body = messages.find(message => message?.jsonrpc === '2.0' && message.id === id);
  if (!body) throw new Error('MCP response incomplete. Check the current state before retrying a write.');
  if (body.error) throw new Error(body.error.message || 'MCP protocol error');
  if (!Object.hasOwn(body, 'result')) throw new Error('Invalid MCP response.');
  return body.result;
}
