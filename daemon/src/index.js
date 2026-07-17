import path from 'node:path';
import process from 'node:process';
import { BleScanner } from './ble-scanner.js';
import { loadConfig } from './config.js';
import { GoveeLanClient } from './govee-lan.js';
import { createHealthServer } from './health-server.js';
import { log } from './logger.js';
import { StateStore } from './state-store.js';

const configPath = process.env.GOVEE_CONFIG_PATH || '/etc/govee-smart-toggle/config.json';
const statePath = process.env.GOVEE_STATE_PATH || '/var/lib/govee-smart-toggle/state.json';

if (process.argv.includes('--check-config')) {
  await loadConfig(configPath);
  log('info', 'config_valid', { configPath: path.resolve(configPath) });
  process.exit(0);
}

const startedAt = Date.now();
const runtime = {
  ble: { state: 'loading', scanning: false },
  stopping: false,
};

const config = await loadConfig(configPath);
const store = new StateStore(statePath);
await store.init();

const lan = new GoveeLanClient({ target: config.target, behavior: config.behavior, store, log });
await lan.start();

let actionQueue = Promise.resolve();
const ble = new BleScanner({
  sensor: config.sensor,
  log,
  onStatus(status) {
    runtime.ble = status;
  },
  onEvent({ sensor, event }) {
    actionQueue = actionQueue
      .then(async () => {
        const now = Date.now();
        const eventKey = `${event.button}:${event.id}`;
        if (!store.acceptEvent(eventKey, now, config.behavior.dedupeTtlMs)) {
          store.increment('duplicates');
          return;
        }

        store.increment('buttonEvents');
        store.update({ lastEventAt: new Date(now).toISOString() });
        log('info', 'button_press', { model: sensor.model, button: event.button, battery: sensor.battery });

        try {
          const result = await lan.smartToggle();
          store.increment('actions');
          log('info', 'smart_toggle', result);
        } catch (error) {
          store.increment('failures');
          log('error', 'smart_toggle_failed', { message: error.message });
        }
      })
      .catch((error) => log('error', 'event_queue_failed', { message: error.message }));
  },
});

const health = createHealthServer({
  config: config.health,
  getStatus() {
    const state = store.snapshot();
    return {
      status: runtime.ble.scanning ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      ble: runtime.ble,
      target: {
        reachable: lan.sessionStatusReceived,
        lastStatusAt: state.lastStatusAt,
        lastPower: state.lastPower,
        lastActionAt: state.lastActionAt,
      },
      lastEventAt: state.lastEventAt,
      metrics: state.metrics,
    };
  },
});

await health.start();
log('info', 'health_listening', config.health);

try {
  await ble.start();
} catch (error) {
  log('error', 'ble_start_failed', { message: error.message });
}

try {
  await lan.refreshStatus();
} catch (error) {
  log('warn', 'initial_status_failed', { message: error.message });
}

async function shutdown(signal) {
  if (runtime.stopping) return;
  runtime.stopping = true;
  log('info', 'shutdown', { signal });
  ble.stop();
  await actionQueue;
  await health.stop();
  await lan.stop();
  await store.flush();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        log('error', 'shutdown_failed', { message: error.message });
        process.exit(1);
      });
  });
}

process.on('unhandledRejection', (error) => {
  log('error', 'unhandled_rejection', { message: error instanceof Error ? error.message : String(error) });
});
