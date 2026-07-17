import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

function integer(value, fallback, { min, max, name }) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < min || resolved > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return resolved;
}

function duration(value, fallback, name, min = 50, max = 86_400_000) {
  return integer(value, fallback, { min, max, name });
}

function optionalInteger(value, { min, max, name }) {
  if (value === null || value === undefined || value === '') return null;
  return integer(value, null, { min, max, name });
}

function normalizeColor(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') throw new Error('action.on.color must be an RGB object or null');
  return {
    r: integer(value.r, null, { min: 0, max: 255, name: 'action.on.color.r' }),
    g: integer(value.g, null, { min: 0, max: 255, name: 'action.on.color.g' }),
    b: integer(value.b, null, { min: 0, max: 255, name: 'action.on.color.b' }),
  };
}

export function validateConfig(raw) {
  const address = String(raw.sensor?.address || '').trim().toLowerCase();
  if (!/^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/.test(address)) {
    throw new Error('sensor.address must be a Bluetooth MAC address');
  }

  const targetIp = String(raw.target?.ip || '').trim();
  if (net.isIP(targetIp) !== 4) throw new Error('target.ip must be an IPv4 address');

  const healthHost = String(raw.health?.host || '127.0.0.1').trim();
  if (!['127.0.0.1', '::1', 'localhost'].includes(healthHost)) {
    throw new Error('health.host must remain loopback-only');
  }

  const actionMode = raw.action?.mode || 'power-toggle';
  if (!['power-toggle', 'power-color-toggle'].includes(actionMode)) {
    throw new Error('action.mode must be power-toggle or power-color-toggle');
  }

  const action = {
    mode: actionMode,
    on: {
      brightness: optionalInteger(raw.action?.on?.brightness, {
        min: 1,
        max: 100,
        name: 'action.on.brightness',
      }),
      color: normalizeColor(raw.action?.on?.color),
    },
  };

  if (actionMode === 'power-color-toggle' && !action.on.color && action.on.brightness === null) {
    throw new Error('power-color-toggle requires a color or brightness');
  }

  return {
    sensor: {
      address,
      button: integer(raw.sensor?.button, 0, { min: 0, max: 5, name: 'sensor.button' }),
    },
    target: {
      ip: targetIp,
      controlPort: integer(raw.target?.controlPort, 4003, { min: 1, max: 65_535, name: 'target.controlPort' }),
      listenPort: integer(raw.target?.listenPort, 4002, { min: 0, max: 65_535, name: 'target.listenPort' }),
    },
    behavior: {
      fallbackPowerOn: raw.behavior?.fallbackPowerOn !== false,
      statusTimeoutMs: duration(raw.behavior?.statusTimeoutMs, 900, 'behavior.statusTimeoutMs'),
      verificationDelayMs: duration(raw.behavior?.verificationDelayMs, 1000, 'behavior.verificationDelayMs'),
      retryOnce: raw.behavior?.retryOnce !== false,
      dedupeTtlMs: duration(raw.behavior?.dedupeTtlMs, 300_000, 'behavior.dedupeTtlMs', 1000),
    },
    action,
    health: {
      host: healthHost,
      port: integer(raw.health?.port, 8788, { min: 1, max: 65_535, name: 'health.port' }),
    },
  };
}

export async function loadConfig(configPath) {
  try {
    return validateConfig(JSON.parse(await fs.readFile(configPath, 'utf8')));
  } catch (error) {
    throw new Error(`Unable to read ${configPath}: ${error.message}`);
  }
}

export async function saveConfig(configPath, value) {
  const config = validateConfig(value);
  const temporaryPath = path.join(
    path.dirname(configPath),
    `.${path.basename(configPath)}.${process.pid}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporaryPath, configPath);
    await fs.chmod(configPath, 0o600);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
  return config;
}
