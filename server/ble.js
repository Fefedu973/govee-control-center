import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { BLE_EVENT_ID_TTL_MS, BLE_FALLBACK_EVENT_WINDOW_MS } from './env.js';
import { readConfig, updateConfig } from './store.js';
import { httpError, nowIso } from './util.js';

const EVENT_HISTORY_LIMIT = 50;

const H512X_MODELS = new Map([
  [3, { model: 'H5121', type: 'motion', buttons: 0 }],
  [8, { model: 'H5122', type: 'button', buttons: 1 }],
  [2, { model: 'H5123', type: 'window', buttons: 0 }],
  [9, { model: 'H5124', type: 'vibration', buttons: 0 }],
  [10, { model: 'H5125', type: 'button', buttons: 6 }],
  [11, { model: 'H5126', type: 'button', buttons: 2 }],
  [13, { model: 'H5130', type: 'pressure', buttons: 1 }],
]);

const BUTTON_MODELS = new Set(['H5122', 'H5125', 'H5126']);

function calculateCrc(data) {
  let crc = 0x1d0f;
  for (const byte of data) {
    for (let shift = 7; shift >= 0; shift -= 1) {
      const mask = ((crc >> 15) ^ ((byte >> shift) & 1)) ? 0x1021 : 0;
      crc = ((crc << 1) ^ mask) & 0xffff;
    }
  }
  return crc;
}

// AES-128-ECB with a key derived from the 4 `time_ms` bytes, same scheme as
// the open-source govee-ble parser used by Home Assistant.
function decryptH512x(timeMs, encrypted) {
  const key = Buffer.concat([Buffer.from(timeMs), Buffer.alloc(12)]).reverse();
  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
  decipher.setAutoPadding(false);
  const decryptedReversed = Buffer.concat([
    decipher.update(Buffer.from(encrypted).reverse()),
    decipher.final(),
  ]);
  return decryptedReversed.reverse();
}

/**
 * Parses one H512x manufacturer-data advertisement. Returns `null` unless the
 * frame is a valid button event from a supported model. `time_ms` is kept as
 * a stable event id: repeated advertisements of the same physical press share
 * the same id, which is what makes deduplication reliable.
 */
export function parseH512xAdvertisement({ address, localName = '', rssi = null, manufacturerData }) {
  if (!Buffer.isBuffer(manufacturerData)) return null;

  let data = manufacturerData;
  if (data.length > 25 && data.includes(Buffer.from('INTELLI_ROCKS'))) data = data.subarray(0, -25);
  if (data.length !== 24) return null;

  const timeMs = data.subarray(2, 6);
  const eventId = timeMs.toString('hex');
  const encrypted = data.subarray(6, 22);
  if (calculateCrc(encrypted) !== data.readUInt16BE(22)) return null;

  let decrypted;
  try {
    decrypted = decryptH512x(timeMs, encrypted);
  } catch {
    return null;
  }

  const modelId = decrypted[2];
  let info = H512X_MODELS.get(modelId);
  if (!info) {
    const match = localName.match(/GV?(512[1-7]|5130)/i);
    if (!match) return null;
    const model = `H${match[1]}`;
    info = [...H512X_MODELS.values()].find((entry) => entry.model === model) || { model, type: 'button', buttons: 1 };
  }
  if (!BUTTON_MODELS.has(info.model)) return null;

  const battery = decrypted[4];
  const buttonNumber = decrypted[5];

  return {
    button: {
      id: address.toLowerCase(),
      address,
      name: localName || `${info.model} ${address.slice(-5)}`,
      model: info.model,
      buttonCount: info.buttons,
      battery,
      rssi,
      lastSeen: nowIso(),
      lastEventId: eventId,
    },
    event: {
      id: eventId,
      type: 'press',
      button: buttonNumber,
      key: `button_${buttonNumber}`,
      battery,
    },
  };
}

function manufacturerCandidates(advertisement) {
  const candidates = [];
  const data = advertisement?.manufacturerData;
  if (Buffer.isBuffer(data)) {
    if (data.length >= 26) candidates.push(data.subarray(2));
    candidates.push(data);
  }
  return candidates;
}

/**
 * Passive BLE listener for Govee H512x buttons. Each deduplicated press runs
 * the action configured for that button through the hub's unified command
 * pipeline (`runAction` is injected by the hub).
 */
export class GoveeBleBridge extends EventEmitter {
  constructor(runAction) {
    super();
    this.runAction = runAction;
    this.noble = null;
    this.available = false;
    this.enabled = false;
    this.scanning = false;
    this.error = null;
    this.buttons = new Map();
    this.actions = new Map();
    this.events = [];
    this.seenEventIds = new Map();
    this.lastFallbackEventAt = new Map();
  }

  async init() {
    const config = await readConfig();
    this.actions = new Map(Object.entries(config.bleActions || {}));
    this.buttons = new Map(
      config.bleButtons
        .filter((button) => button?.id)
        .map((button) => [button.id, { ...button, action: this.actions.get(button.id) || button.action || null }]),
    );
    try {
      const imported = await import('@stoprocent/noble');
      this.noble = imported.default || imported;
      this.available = true;
      this.noble.on('stateChange', (state) => this.#onStateChange(state));
      this.noble.on('discover', (peripheral) => this.#onDiscover(peripheral));
      if (config.bleEnabled) await this.setEnabled(true);
    } catch (error) {
      this.error = `BLE module unavailable: ${error.message}`;
      console.warn(`[ble] ${this.error}`);
    }
    this.emitStatus();
  }

  status() {
    return {
      available: this.available,
      enabled: this.enabled,
      scanning: this.scanning,
      state: this.noble?.state || null,
      error: this.error,
    };
  }

  allButtons() {
    return [...this.buttons.values()].sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
  }

  allEvents() {
    return [...this.events];
  }

  async setEnabled(enabled) {
    if (!this.available || !this.noble) {
      throw httpError(this.error || 'Bluetooth is not available on this server.', 503);
    }

    this.enabled = Boolean(enabled);
    await this.#persist();

    if (this.enabled) this.#startScanWhenPoweredOn();
    else this.#stopScan();
    this.emitStatus();
  }

  async setAction(buttonId, action) {
    const normalized = this.#normalizeAction(action);
    this.actions.set(buttonId, normalized);
    const button = this.buttons.get(buttonId);
    if (button) {
      button.action = normalized;
      this.buttons.set(buttonId, button);
      this.emitButtons();
    }
    await this.#persist();
    return normalized;
  }

  async testAction(buttonId) {
    const button = this.buttons.get(buttonId);
    if (!button) throw httpError('Unknown BLE button', 404);
    const action = this.actions.get(buttonId);
    if (!action) throw httpError('No action configured for this BLE button', 400);

    const event = { id: `manual-test-${Date.now().toString(36)}`, type: 'manual-test', key: 'manual-test', battery: button.battery ?? null };
    await this.#executeAction(button, event, action);
    const payload = { button, event, action, test: true, at: nowIso() };
    this.#rememberEvent(payload);
    this.emit('buttonEvent', payload);
    return payload;
  }

  #normalizeAction(action = {}) {
    const mode = ['smart-toggle', 'toggle-cached', 'turn-on', 'turn-off'].includes(action.mode) ? action.mode : 'smart-toggle';
    if (typeof action.targetDeviceId !== 'string' || !action.targetDeviceId.trim()) {
      throw httpError('targetDeviceId is required', 400);
    }
    return {
      targetDeviceId: action.targetDeviceId.trim(),
      mode,
      fallbackOnUnknown: action.fallbackOnUnknown !== false,
    };
  }

  #onStateChange(state) {
    console.log(`[ble] adapter state: ${state}`);
    if (state === 'poweredOn' && this.enabled) this.#startScanWhenPoweredOn();
    if (state !== 'poweredOn') this.#stopScan();
    this.emitStatus();
  }

  #startScanWhenPoweredOn() {
    if (!this.noble || this.noble.state !== 'poweredOn' || this.scanning || !this.enabled) return;
    try {
      this.noble.startScanning([], true);
      this.scanning = true;
      this.error = null;
      console.log('[ble] passive scan started');
    } catch (error) {
      this.error = error.message;
      console.warn(`[ble] scan failed: ${error.message}`);
    }
    this.emitStatus();
  }

  #stopScan() {
    if (!this.noble || !this.scanning) return;
    try { this.noble.stopScanning(); } catch { }
    this.scanning = false;
  }

  #onDiscover(peripheral) {
    const address = String(peripheral.address || peripheral.id || '').toLowerCase();
    if (!address) return;
    const advertisement = peripheral.advertisement || {};
    const localName = advertisement.localName || advertisement.completeLocalName || '';

    for (const candidate of manufacturerCandidates(advertisement)) {
      const parsed = parseH512xAdvertisement({
        address,
        localName,
        rssi: peripheral.rssi,
        manufacturerData: candidate,
      });
      if (!parsed) continue;

      const action = this.actions.get(parsed.button.id) || null;
      const button = { ...(this.buttons.get(parsed.button.id) || {}), ...parsed.button, action };
      this.buttons.set(button.id, button);
      this.emitButtons();
      this.#handleButtonEvent(button, parsed.event);
      return;
    }
  }

  #handleButtonEvent(button, event) {
    if (this.#isDuplicate(button, event)) return;

    const payload = { button, event, at: nowIso() };
    console.log(`[ble:event] ${button.model} ${button.address} ${event.key} ${event.id}`);
    this.#rememberEvent(payload);
    this.emit('buttonEvent', payload);
    this.#persist().catch(() => { });

    const action = this.actions.get(button.id);
    if (action) {
      this.#executeAction(button, event, action).catch((error) => {
        this.emit('errorMessage', `BLE action failed for ${button.name}: ${error.message}`);
      });
    }
  }

  #rememberEvent(event) {
    this.events = [event, ...this.events].slice(0, EVENT_HISTORY_LIMIT);
  }

  // Same physical press => same H512x event id => ignore. Presses from models
  // without an event id fall back to a time window.
  #isDuplicate(button, event) {
    const now = Date.now();
    for (const [key, seenAt] of this.seenEventIds) {
      if (now - seenAt > BLE_EVENT_ID_TTL_MS) this.seenEventIds.delete(key);
    }

    if (event.id) {
      const key = `${button.id}:${event.key}:${event.id}`;
      if (this.seenEventIds.has(key)) return true;
      this.seenEventIds.set(key, now);
      return false;
    }

    const fallbackKey = `${button.id}:${event.key}`;
    const last = this.lastFallbackEventAt.get(fallbackKey) || 0;
    if (now - last < BLE_FALLBACK_EVENT_WINDOW_MS) return true;
    this.lastFallbackEventAt.set(fallbackKey, now);
    return false;
  }

  async #executeAction(button, event, action) {
    await this.runAction(action);
    this.emit('actionExecuted', { button, event, action, at: nowIso() });
  }

  async #persist() {
    await updateConfig((currentConfig) => {
      currentConfig.bleEnabled = this.enabled;
      currentConfig.bleActions = Object.fromEntries(this.actions.entries());
      currentConfig.bleButtons = this.allButtons();
      return currentConfig;
    });
  }

  emitStatus() {
    this.emit('status', this.status());
  }

  emitButtons() {
    this.emit('buttons', this.allButtons());
  }
}
