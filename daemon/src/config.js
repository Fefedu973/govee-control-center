import fs from 'node:fs/promises';
import net from 'node:net';

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

export async function loadConfig(configPath) {
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${configPath}: ${error.message}`);
  }

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
    health: {
      host: healthHost,
      port: integer(raw.health?.port, 8788, { min: 1, max: 65_535, name: 'health.port' }),
    },
  };
}
