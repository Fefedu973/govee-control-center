import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIST_DIR, HTTP_PORT } from './env.js';
import { GoveeLanBridge } from './lan.js';
import { GoveeCloudApi } from './cloud.js';
import { GoveeBleBridge } from './ble.js';
import { DeviceHub } from './hub.js';
import { httpError, validateIpv4 } from './util.js';

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError('Invalid JSON body', 400);
  }
}

const STATIC_CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(DIST_DIR, pathname));
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'content-type': STATIC_CONTENT_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT' && pathname !== '/index.html') {
      req.url = '/';
      await serveStatic(req, res);
    } else if (error.code === 'ENOENT') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>Govee Control Hub</title><body style="font-family:system-ui;padding:2rem"><h1>Frontend not built yet</h1><p>Run <code>bun run dev</code> during development, or <code>bun run build && bun run start</code> for production.</p></body>');
    } else {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error.message);
    }
  }
}

export function createApp() {
  const lan = new GoveeLanBridge();
  const cloud = new GoveeCloudApi();
  const hub = new DeviceHub(lan, cloud);
  const ble = new GoveeBleBridge((action) => hub.runBleAction(action));

  const sseClients = new Set();

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) res.write(payload);
  }

  hub.on('devices', (devices) => broadcast('devices', { devices }));
  hub.on('scenes', (scenes) => broadcast('scenes', { scenes }));
  hub.on('cloudStatus', (status) => broadcast('cloud-status', { status }));
  lan.on('scan', (scan) => broadcast('scan', scan));
  lan.on('settings', (settings) => broadcast('settings', { settings }));
  lan.on('retry', (retry) => broadcast('retry', retry));
  lan.on('errorMessage', (message) => broadcast('error', { message }));
  ble.on('status', (status) => broadcast('ble-status', { status }));
  ble.on('buttons', (buttons) => broadcast('ble-buttons', { buttons }));
  ble.on('buttonEvent', (payload) => broadcast('ble-event', payload));
  ble.on('actionExecuted', (payload) => broadcast('ble-action', payload));
  ble.on('errorMessage', (message) => broadcast('error', { message }));

  async function fullState() {
    return {
      devices: hub.allDevices(),
      scenes: await hub.listScenes(),
      settings: lan.settings(),
      cloud: hub.cloudStatus(),
      ble: {
        status: ble.status(),
        buttons: ble.allButtons(),
        events: ble.allEvents(),
      },
    };
  }

  async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;

    if (pathname === '/api/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      const state = await fullState();
      res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (pathname === '/api/state' && req.method === 'GET') {
      jsonResponse(res, 200, await fullState());
      return;
    }

    if (pathname === '/api/scan' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const ips = Array.isArray(body.ips) ? body.ips.map(validateIpv4) : [];
      lan.scan({ ips });
      jsonResponse(res, 200, { ok: true, ips });
      return;
    }

    if (pathname === '/api/devices/manual' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const ip = validateIpv4(body.ip);
      lan.addManualDevice({
        ip,
        device: typeof body.device === 'string' && body.device.trim() ? body.device.trim() : undefined,
        sku: typeof body.sku === 'string' && body.sku.trim() ? body.sku.trim() : undefined,
      });
      jsonResponse(res, 200, { ok: true, devices: hub.allDevices() });
      return;
    }

    const commandMatch = pathname.match(/^\/api\/devices\/([^/]+)\/command$/);
    if (commandMatch && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = await hub.command(commandMatch[1], body);
      jsonResponse(res, 200, { ok: true, result, devices: hub.allDevices() });
      return;
    }

    const cloudScenesMatch = pathname.match(/^\/api\/devices\/([^/]+)\/cloud-scenes$/);
    if (cloudScenesMatch && req.method === 'GET') {
      jsonResponse(res, 200, { ok: true, ...(await hub.cloudScenesFor(cloudScenesMatch[1])) });
      return;
    }

    if (pathname === '/api/actions/all' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const results = await hub.allAction(body);
      jsonResponse(res, 200, { ok: true, results, devices: hub.allDevices() });
      return;
    }

    if (pathname === '/api/scenes' && req.method === 'GET') {
      jsonResponse(res, 200, { scenes: await hub.listScenes() });
      return;
    }

    if (pathname === '/api/scenes/snapshot' && req.method === 'POST') {
      const body = await readJsonBody(req);
      jsonResponse(res, 200, { ok: true, ...(await hub.snapshotScene(body.name)) });
      return;
    }

    const sceneMatch = pathname.match(/^\/api\/scenes\/([^/]+)(\/apply)?$/);
    if (sceneMatch) {
      const sceneId = decodeURIComponent(sceneMatch[1]);
      if (sceneMatch[2] && req.method === 'POST') {
        jsonResponse(res, 200, { ok: true, ...(await hub.applyScene(sceneId)), devices: hub.allDevices() });
        return;
      }
      if (!sceneMatch[2] && req.method === 'DELETE') {
        jsonResponse(res, 200, { ok: true, scenes: await hub.deleteScene(sceneId) });
        return;
      }
    }

    if (pathname === '/api/ble/enable' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (typeof body.enabled !== 'boolean') throw httpError('enabled must be a boolean', 400);
      await ble.setEnabled(body.enabled);
      jsonResponse(res, 200, { ok: true, status: ble.status() });
      return;
    }

    const bleActionMatch = pathname.match(/^\/api\/ble\/buttons\/([^/]+)\/(action|test)$/);
    if (bleActionMatch && req.method === 'POST') {
      const buttonId = decodeURIComponent(bleActionMatch[1]);
      if (bleActionMatch[2] === 'action') {
        const body = await readJsonBody(req);
        const action = await ble.setAction(buttonId, body);
        jsonResponse(res, 200, { ok: true, action, buttons: ble.allButtons() });
      } else {
        jsonResponse(res, 200, { ok: true, payload: await ble.testAction(buttonId) });
      }
      return;
    }

    if (pathname === '/api/cloud/api-key' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const status = await hub.setCloudApiKey(body.apiKey ?? '');
      jsonResponse(res, 200, { ok: true, status });
      return;
    }

    if (pathname === '/api/cloud/refresh' && req.method === 'POST') {
      jsonResponse(res, 200, { ok: true, status: await hub.refreshCloud(), devices: hub.allDevices() });
      return;
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
      const body = await readJsonBody(req);
      jsonResponse(res, 200, { ok: true, settings: await lan.setSettings(body) });
      return;
    }

    if (pathname.startsWith('/api/')) {
      jsonResponse(res, 404, { ok: false, error: 'Unknown API route' });
      return;
    }

    if (req.method === 'GET') {
      await serveStatic(req, res);
      return;
    }

    jsonResponse(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      jsonResponse(res, error.statusCode || 500, { ok: false, error: error.message });
    });
  });

  async function start() {
    server.listen(HTTP_PORT, async () => {
      console.log(`[web] http://localhost:${HTTP_PORT}`);
      await cloud.init();
      await lan.init();
      lan.start();
      await ble.init();
      if (cloud.status().configured) {
        hub.refreshCloud().catch((error) => console.warn(`[cloud] initial refresh failed: ${error.message}`));
      }
    });
  }

  async function shutdown() {
    console.log('\n[shutdown] Closing sockets...');
    try { lan.stop(); } catch { }
    try { ble.noble?.stopScanning?.(); } catch { }
    server.close(() => process.exit(0));
  }

  return { server, start, shutdown };
}
