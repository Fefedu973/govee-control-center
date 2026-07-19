import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export const HTTP_PORT = Number(process.env.PORT || 8787);

export const MULTICAST_ADDRESS = process.env.GOVEE_MULTICAST_ADDRESS || '239.255.255.250';
export const SCAN_PORT = Number(process.env.GOVEE_SCAN_PORT || 4001);
export const LISTEN_PORT = Number(process.env.GOVEE_LISTEN_PORT || 4002);
export const CONTROL_PORT = Number(process.env.GOVEE_CONTROL_PORT || 4003);
export const AUTO_SCAN_INTERVAL_MS = Number(process.env.GOVEE_AUTOSCAN_INTERVAL_MS || 10_000);
export const STATUS_POLL_INTERVAL_MS = Number(process.env.GOVEE_STATUS_POLL_INTERVAL_MS || 30_000);
export const DEFAULT_SCAN_IPS = (process.env.GOVEE_SCAN_IPS || '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

export const RETRY_VERIFY_DELAY_MS = Number(process.env.GOVEE_RETRY_VERIFY_DELAY_MS || 1_600);
export const RETRY_STATUS_WAIT_MS = Number(process.env.GOVEE_RETRY_STATUS_WAIT_MS || 700);
export const RETRY_MAX_ATTEMPTS = Number(process.env.GOVEE_RETRY_MAX_ATTEMPTS || 2);

export const BLE_DEFAULT_ENABLED = ['1', 'true', 'yes'].includes(String(process.env.GOVEE_BLE_ENABLED || '').toLowerCase());
export const BLE_EVENT_ID_TTL_MS = Number(process.env.GOVEE_BLE_EVENT_ID_TTL_MS || 10 * 60 * 1000);
export const BLE_FALLBACK_EVENT_WINDOW_MS = Number(process.env.GOVEE_BLE_FALLBACK_EVENT_WINDOW_MS || 9_000);

export const CLOUD_API_KEY_ENV = process.env.GOVEE_API_KEY || process.env.GOVEE_CLOUD_API_KEY || '';
export const CLOUD_BASE_URL = (process.env.GOVEE_CLOUD_BASE_URL || 'https://openapi.api.govee.com/router/api/v1').replace(/\/$/, '');

export const DIST_DIR = path.join(ROOT_DIR, 'dist');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
