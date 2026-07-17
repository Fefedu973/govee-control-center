import http from 'node:http';
import { managementPage } from './management-page.js';

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

export function createHealthServer({
  config,
  getStatus,
  getConfig,
  getDiscovery,
  saveConfig,
  testAction,
  discoverLan,
}) {
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' });
      response.end(managementPage);
      return;
    }

    if (request.method === 'GET' && request.url === '/api/config') {
      sendJson(response, 200, getConfig());
      return;
    }
    if (request.method === 'GET' && request.url === '/api/status') {
      const status = getStatus();
      sendJson(response, 200, { ...status, ready: status.ble.scanning && status.target.reachable });
      return;
    }
    if (request.method === 'GET' && request.url === '/api/discovery') {
      sendJson(response, 200, getDiscovery());
      return;
    }

    try {
      if (request.method === 'POST' && request.url === '/api/config') {
        sendJson(response, 200, await saveConfig(await readJson(request)));
        return;
      }
      if (request.method === 'POST' && request.url === '/api/action/test') {
        sendJson(response, 200, await testAction());
        return;
      }
      if (request.method === 'POST' && request.url === '/api/discovery/lan') {
        await discoverLan();
        sendJson(response, 202, { accepted: true });
        return;
      }
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }

    if (!['/healthz', '/readyz'].includes(request.url)) {
      sendJson(response, 404, { error: 'not_found' });
      return;
    }

    const status = getStatus();
    const ready = status.ble.scanning && status.target.reachable;
    const code = request.url === '/readyz' && !ready ? 503 : 200;
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
