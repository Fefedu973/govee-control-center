import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { managementPage } from './management-page.js';

const DEFAULT_STATIC_ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJson(request) {
  if (!String(request.headers['content-type'] || '').startsWith('application/json')) {
    throw new Error('Content-Type application/json is required');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_768) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStatic(response, staticRoot, pathname) {
  const relativePath = pathname === '/'
    ? 'index.html'
    : pathname.startsWith('/assets/')
      ? pathname.slice(1)
      : null;
  if (!relativePath) return false;

  const root = path.resolve(staticRoot);
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(`${root}${path.sep}`)) return false;

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      'cache-control': pathname === '/'
        ? 'no-store'
        : 'public, max-age=31536000, immutable',
      'content-type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream',
    });
    response.end(content);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return false;
    throw error;
  }
}

export function createHealthServer({
  config,
  getStatus,
  getConfig,
  getDiscovery,
  saveConfig,
  testAction,
  discoverLan,
  staticRoot = DEFAULT_STATIC_ROOT,
}) {
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;

    if (request.method === 'GET' && (pathname === '/' || pathname.startsWith('/assets/'))) {
      try {
        if (await serveStatic(response, staticRoot, pathname)) return;
      } catch (error) {
        sendJson(response, 500, { error: error.message });
        return;
      }
      if (pathname === '/') {
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-type': 'text/html; charset=utf-8',
        });
        response.end(managementPage);
        return;
      }
    }

    if (request.method === 'GET' && pathname === '/api/config') {
      sendJson(response, 200, getConfig());
      return;
    }
    if (request.method === 'GET' && pathname === '/api/status') {
      const status = getStatus();
      sendJson(response, 200, { ...status, ready: status.ble.scanning && status.target.reachable });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/discovery') {
      sendJson(response, 200, getDiscovery());
      return;
    }

    try {
      if (request.method === 'POST' && pathname === '/api/config') {
        sendJson(response, 200, await saveConfig(await readJson(request)));
        return;
      }
      if (request.method === 'POST' && pathname === '/api/action/test') {
        sendJson(response, 200, await testAction());
        return;
      }
      if (request.method === 'POST' && pathname === '/api/discovery/lan') {
        await discoverLan();
        sendJson(response, 202, { accepted: true });
        return;
      }
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }

    if (!['/healthz', '/readyz'].includes(pathname)) {
      sendJson(response, 404, { error: 'not_found' });
      return;
    }

    const status = getStatus();
    const ready = status.ble.scanning && status.target.reachable;
    const code = pathname === '/readyz' && !ready ? 503 : 200;
    sendJson(response, code, { ...status, ready });
  });

  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, resolve);
      });
      return server.address();
    },
    async stop() {
      if (!server.listening) return;
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
