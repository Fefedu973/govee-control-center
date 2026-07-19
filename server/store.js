import fs from 'node:fs/promises';
import { BLE_DEFAULT_ENABLED, CONFIG_PATH, DATA_DIR } from './env.js';

function defaultConfig() {
  return {
    bleEnabled: BLE_DEFAULT_ENABLED,
    bleActions: {},
    bleButtons: [],
    scenes: [],
    cloudApiKey: '',
    retryMode: false,
  };
}

function normalizeConfig(config = {}) {
  const defaults = defaultConfig();
  return {
    bleEnabled: typeof config.bleEnabled === 'boolean' ? config.bleEnabled : defaults.bleEnabled,
    bleActions: config.bleActions && typeof config.bleActions === 'object' && !Array.isArray(config.bleActions) ? config.bleActions : {},
    // `bleSensors` is the pre-3.0 name of the same list.
    bleButtons: Array.isArray(config.bleButtons) ? config.bleButtons : Array.isArray(config.bleSensors) ? config.bleSensors : [],
    scenes: Array.isArray(config.scenes) ? config.scenes : [],
    cloudApiKey: typeof config.cloudApiKey === 'string' ? config.cloudApiKey : '',
    retryMode: Boolean(config.retryMode),
  };
}

export async function readConfig() {
  try {
    return normalizeConfig(JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8')));
  } catch {
    return defaultConfig();
  }
}

let writeQueue = Promise.resolve();

export async function updateConfig(mutator) {
  const run = writeQueue.then(async () => {
    const config = await readConfig();
    const nextConfig = normalizeConfig(await mutator(config) || config);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(nextConfig, null, 2));
    return nextConfig;
  });
  writeQueue = run.catch(() => {});
  return run;
}
