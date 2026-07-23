import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHealthServer } from '../src/health-server.js';

test('serves the local console and delegates configuration and test actions', async () => {
  const currentConfig = { action: { mode: 'power-toggle', on: { brightness: null, color: null } } };
  let savedConfig = null;
  let actions = 0;
  let discoveries = 0;
  const server = createHealthServer({
    config: { host: '127.0.0.1', port: 0 },
    getConfig: () => currentConfig,
    getDiscovery: () => ({ bluetooth: [], lan: [] }),
    getStatus: () => ({ ble: { scanning: true }, target: { reachable: true } }),
    saveConfig: async (value) => {
      savedConfig = value;
      return value;
    },
    testAction: async () => {
      actions += 1;
      return { nextPower: 1 };
    },
    discoverLan: async () => {
      discoveries += 1;
    },
  });

  const address = await server.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Govee Smart Toggle/);

    const status = await (await fetch(`${baseUrl}/api/status`)).json();
    assert.equal(status.ready, true);

    const saveResponse = await fetch(`${baseUrl}/api/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(currentConfig),
    });
    assert.equal(saveResponse.status, 200);
    assert.deepEqual(savedConfig, currentConfig);

    assert.equal((await fetch(`${baseUrl}/api/action/test`, { method: 'POST' })).status, 200);
    assert.equal(actions, 1);
    assert.equal((await fetch(`${baseUrl}/api/discovery/lan`, { method: 'POST' })).status, 202);
    assert.equal(discoveries, 1);
  } finally {
    await server.stop();
  }
});

test('serves the compiled React console and immutable assets', async () => {
  const staticRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'govee-console-'));
  await fs.mkdir(path.join(staticRoot, 'assets'));
  await fs.writeFile(path.join(staticRoot, 'index.html'), '<main>React console</main>');
  await fs.writeFile(path.join(staticRoot, 'assets', 'app.js'), 'console.log("ready")');

  const server = createHealthServer({
    config: { host: '127.0.0.1', port: 0 },
    staticRoot,
    getConfig: () => ({}),
    getDiscovery: () => ({ bluetooth: [], lan: [] }),
    getStatus: () => ({ ble: { scanning: true }, target: { reachable: true } }),
    saveConfig: async (value) => value,
    testAction: async () => ({}),
    discoverLan: async () => {},
  });

  try {
    const address = await server.start();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const page = await fetch(baseUrl);
    assert.equal(await page.text(), '<main>React console</main>');
    assert.equal(page.headers.get('cache-control'), 'no-store');

    const asset = await fetch(`${baseUrl}/assets/app.js`);
    assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(await asset.text(), 'console.log("ready")');
  } finally {
    await server.stop();
    await fs.rm(staticRoot, { recursive: true, force: true });
  }
});
