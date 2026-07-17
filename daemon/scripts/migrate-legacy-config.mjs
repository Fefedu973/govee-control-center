import fs from 'node:fs/promises';
import path from 'node:path';

const [legacyPath, apiUrl, outputPath] = process.argv.slice(2);
if (!legacyPath || !apiUrl || !outputPath) {
  console.error('Usage: node migrate-legacy-config.mjs LEGACY_CONFIG API_URL OUTPUT_PATH');
  process.exit(2);
}

const legacy = JSON.parse(await fs.readFile(legacyPath, 'utf8'));
const sensors = Array.isArray(legacy.bleSensors) ? legacy.bleSensors : [];
const actions = Object.entries(legacy.bleActions || {});
if (sensors.length !== 1 || actions.length !== 1) {
  throw new Error(`Expected exactly one BLE sensor and one action, found ${sensors.length}/${actions.length}`);
}

const [sensorId, action] = actions[0];
const sensor = sensors.find((entry) => entry.id === sensorId) || sensors[0];
if (sensor.model !== 'H5122') throw new Error(`Expected H5122, found ${sensor.model || 'unknown'}`);
if (action.mode !== 'smart-toggle') throw new Error(`Expected smart-toggle, found ${action.mode || 'unknown'}`);

const response = await fetch(apiUrl);
if (!response.ok) throw new Error(`Legacy API returned HTTP ${response.status}`);
const payload = await response.json();
const devices = Array.isArray(payload) ? payload : payload.devices || [];
const target = devices.find((entry) => entry.id === action.targetDeviceId);
if (!target?.ip) throw new Error('Target device is not currently discoverable through the legacy service');

const config = {
  sensor: {
    address: String(sensor.address || sensor.id).toLowerCase(),
    button: 0,
  },
  target: {
    ip: target.ip,
    controlPort: 4003,
    listenPort: 4002,
  },
  behavior: {
    fallbackPowerOn: action.fallbackOnUnknown !== false,
    statusTimeoutMs: 900,
    verificationDelayMs: 1000,
    retryOnce: true,
    dedupeTtlMs: 300000,
  },
  health: {
    host: '127.0.0.1',
    port: 8788,
  },
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log(`Migrated one ${sensor.model} smart-toggle mapping to ${outputPath}`);
