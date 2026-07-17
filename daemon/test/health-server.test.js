import assert from 'node:assert/strict';
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
