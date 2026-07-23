import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfig, saveConfig, validateConfig } from '../src/config.js';

const baseConfig = {
  sensor: { address: 'aa:bb:cc:dd:ee:ff', button: 0 },
  target: { ip: '192.168.1.50', controlPort: 4003, listenPort: 4002 },
  behavior: {},
  health: { host: '127.0.0.1', port: 8788 },
};

test('defaults to the simple power toggle action', () => {
  assert.deepEqual(validateConfig(baseConfig).action, {
    mode: 'power-toggle',
    on: { brightness: null, color: null, kelvin: null },
  });
});

test('accepts a forced color and brightness action', () => {
  const config = validateConfig({
    ...baseConfig,
    action: {
      mode: 'power-color-toggle',
      on: { brightness: 80, color: { r: 255, g: 120, b: 48 } },
    },
  });
  assert.equal(config.action.mode, 'power-color-toggle');
  assert.deepEqual(config.action.on.color, { r: 255, g: 120, b: 48 });
});

test('accepts a forced color temperature action', () => {
  const config = validateConfig({
    ...baseConfig,
    action: {
      mode: 'power-color-toggle',
      on: { brightness: 65, color: null, kelvin: 4200 },
    },
  });
  assert.equal(config.action.on.kelvin, 4200);
  assert.equal(config.action.on.color, null);
});

test('rejects simultaneous RGB and color temperature settings', () => {
  assert.throws(
    () => validateConfig({
      ...baseConfig,
      action: {
        mode: 'power-color-toggle',
        on: {
          color: { r: 255, g: 120, b: 48 },
          kelvin: 4200,
        },
      },
    }),
    /mutually exclusive/,
  );
});

test('rejects a forced action without a visual setting', () => {
  assert.throws(
    () => validateConfig({ ...baseConfig, action: { mode: 'power-color-toggle', on: {} } }),
    /requires a color, color temperature, or brightness/,
  );
});

test('saves and reloads an editable configuration atomically', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'govee-config-'));
  const configPath = path.join(directory, 'config.json');
  try {
    await saveConfig(configPath, baseConfig);
    const saved = await loadConfig(configPath);
    assert.equal(saved.sensor.address, 'aa:bb:cc:dd:ee:ff');
    assert.equal(saved.action.mode, 'power-toggle');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
