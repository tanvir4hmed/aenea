// Offline fixture server; never imported by production or deployment.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from '../apps/web/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({ entryPoints: [resolve(root, 'tests/ui-preview.jsx')], bundle: true, write: false,
  outdir: 'preview', alias: { react: resolve(root, 'apps/web/node_modules/react'), 'react-dom': resolve(root, 'apps/web/node_modules/react-dom') },
  define: { 'process.env.NODE_ENV': '"development"' } });
const files = Object.fromEntries(result.outputFiles.map(file => [file.path.endsWith('.css') ? '/fixture.css' : '/fixture.js', file.contents]));
createServer((request, response) => {
  if (files[request.url]) { response.setHeader('Content-Type', request.url.endsWith('.css') ? 'text/css' : 'text/javascript'); response.end(files[request.url]); return; }
  if (request.url.startsWith('/fixture')) { response.writeHead(404); response.end('Local fixture has no backend'); return; }
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Aenea local UI check</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
}).listen(Number(process.env.PREVIEW_PORT || 4179), '127.0.0.1', () => console.log(`Local UI fixture: http://127.0.0.1:${process.env.PREVIEW_PORT || 4179}`));
