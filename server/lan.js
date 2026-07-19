import crypto from 'node:crypto';
import dgram from 'node:dgram';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import {
  AUTO_SCAN_INTERVAL_MS,
  CONTROL_PORT,
  DEFAULT_SCAN_IPS,
  LISTEN_PORT,
  MULTICAST_ADDRESS,
  RETRY_MAX_ATTEMPTS,
  RETRY_STATUS_WAIT_MS,
  RETRY_VERIFY_DELAY_MS,
  SCAN_PORT,
  STATUS_POLL_INTERVAL_MS,
} from './env.js';
import { readConfig, updateConfig } from './store.js';
import { clampInteger, httpError, normalizeRgb, nowIso, sleep } from './util.js';

function listLocalIpv4Addresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0) >>> 0;
}

function intToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

function listInterfaceBroadcastAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal && iface.address && iface.netmask)
    .map((iface) => {
      const ip = ipv4ToInt(iface.address);
      const mask = ipv4ToInt(iface.netmask);
      return intToIpv4(((ip & mask) | (~mask >>> 0)) >>> 0);
    });
}

/**
 * Bridge to the Govee LAN API: UDP discovery (multicast/broadcast/unicast),
 * device control on port 4003 and status listening on port 4002.
 */
export class GoveeLanBridge extends EventEmitter {
  constructor() {
    super();
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.devices = new Map();
    this.started = false;
    this.autoScanTimer = null;
    this.statusTimer = null;
    this.retryMode = false;
    this.retryTokens = new Map();
  }

  async init() {
    const config = await readConfig();
    this.retryMode = Boolean(config.retryMode);
  }

  settings() {
    return {
      retryMode: this.retryMode,
      retryMaxAttempts: RETRY_MAX_ATTEMPTS,
      retryVerifyDelayMs: RETRY_VERIFY_DELAY_MS,
    };
  }

  async setSettings(settings = {}) {
    if (typeof settings.retryMode === 'boolean') this.retryMode = settings.retryMode;
    const config = await updateConfig((currentConfig) => {
      currentConfig.retryMode = this.retryMode;
      return currentConfig;
    });
    this.retryMode = Boolean(config.retryMode);
    this.emit('settings', this.settings());
    return this.settings();
  }

  start() {
    if (this.started) return;
    this.started = true;

    this.socket.on('message', (buffer, rinfo) => this.#handleMessage(buffer, rinfo));
    this.socket.on('error', (error) => {
      console.error('[udp:error]', error);
      this.emit('errorMessage', error.message);
    });

    this.socket.bind(LISTEN_PORT, () => {
      try {
        this.socket.setBroadcast(true);
        this.socket.setMulticastTTL(4);
      } catch (error) {
        console.warn('[udp:socket-options]', error.message);
      }

      const localAddresses = listLocalIpv4Addresses();
      let joined = false;
      for (const address of localAddresses) {
        try {
          this.socket.addMembership(MULTICAST_ADDRESS, address);
          joined = true;
        } catch (error) {
          console.warn(`[udp:membership] Failed on ${address}: ${error.message}`);
        }
      }
      if (!joined) {
        try {
          this.socket.addMembership(MULTICAST_ADDRESS);
        } catch (error) {
          console.warn(`[udp:membership] Failed without interface: ${error.message}`);
        }
      }

      console.log(`[udp] Listening on 0.0.0.0:${LISTEN_PORT}`);
      console.log(`[udp] Discovery multicast target: ${MULTICAST_ADDRESS}:${SCAN_PORT}`);
      this.scan({ ips: DEFAULT_SCAN_IPS });
      this.autoScanTimer = setInterval(() => this.scan({ ips: DEFAULT_SCAN_IPS }), AUTO_SCAN_INTERVAL_MS);
      this.statusTimer = setInterval(() => this.pollKnownDevices(), STATUS_POLL_INTERVAL_MS);
    });
  }

  stop() {
    if (!this.started) return;
    clearInterval(this.autoScanTimer);
    clearInterval(this.statusTimer);
    this.socket.close();
    this.started = false;
  }

  allDevices() {
    return [...this.devices.values()].sort((a, b) => {
      const left = `${a.sku || ''}${a.ip || ''}${a.id || ''}`;
      const right = `${b.sku || ''}${b.ip || ''}${b.id || ''}`;
      return left.localeCompare(right);
    });
  }

  scan({ ips = [] } = {}) {
    const request = { msg: { cmd: 'scan', data: { account_topic: 'reserve' } } };
    this.#sendJson(request, SCAN_PORT, MULTICAST_ADDRESS);

    const broadcastTargets = [...new Set(listInterfaceBroadcastAddresses())];
    for (const address of broadcastTargets) this.#sendJson(request, SCAN_PORT, address);

    const uniqueIps = [...new Set([...DEFAULT_SCAN_IPS, ...(ips || [])].filter(Boolean))];
    for (const ip of uniqueIps) this.#sendJson(request, SCAN_PORT, ip);

    this.emit('scan', { multicast: MULTICAST_ADDRESS, broadcasts: broadcastTargets, ips: uniqueIps, at: nowIso() });
  }

  addManualDevice({ ip, device, sku }) {
    const id = device || `manual:${ip}`;
    const existing = this.devices.get(id) || {};
    const entry = {
      ...existing,
      id,
      ip,
      device: device || existing.device || id,
      sku: sku || existing.sku || 'Unknown',
      manual: true,
      firstSeen: existing.firstSeen || nowIso(),
      lastSeen: nowIso(),
      online: true,
      status: existing.status || null,
      raw: existing.raw || null,
    };
    this.devices.set(id, entry);
    this.emitDevices();
    this.queryStatus(id);
    return entry;
  }

  getDevice(id) {
    const device = this.devices.get(id);
    if (!device) throw httpError('Unknown LAN device. Run a scan first or add it manually by IP.', 404);
    return device;
  }

  getKnownPower(id) {
    const device = this.getDevice(id);
    return typeof device.status?.onOff === 'number' ? device.status.onOff : null;
  }

  setPower(id, on) {
    const value = on ? 1 : 0;
    const issuedAt = Date.now();
    this.#sendPowerCommand(id, value);
    this.#scheduleStatusRefresh(id);
    this.#scheduleRetryVerification({
      id,
      kind: 'power',
      label: value ? 'allumage' : 'extinction',
      expected: { onOff: value },
      issuedAt,
      resend: () => this.#sendPowerCommand(id, value),
    });
  }

  #sendPowerCommand(id, value) {
    const device = this.getDevice(id);
    this.#control(device, { msg: { cmd: 'turn', data: { value } } });
    this.#patchStatus(device.id, { onOff: value }, 'optimistic');
  }

  async smartToggle(id, { fallbackOnUnknown = true, freshRead = true } = {}) {
    if (freshRead) {
      try {
        this.queryStatus(id);
        await sleep(450);
      } catch { }
    }
    const current = this.getKnownPower(id);
    const nextOn = current === null ? Boolean(fallbackOnUnknown) : current !== 1;
    this.setPower(id, nextOn);
    return { current, nextOn };
  }

  setBrightness(id, value) {
    const brightness = clampInteger(value, 1, 100, 'brightness');
    const device = this.getDevice(id);
    this.#control(device, { msg: { cmd: 'brightness', data: { value: brightness } } });
    this.#patchStatus(device.id, { brightness }, 'optimistic');
    this.#scheduleStatusRefresh(device.id);
  }

  setColor(id, color) {
    const normalized = normalizeRgb(color);
    const issuedAt = Date.now();
    this.#sendColorCommand(id, normalized);
    this.#scheduleStatusRefresh(id);
    this.#scheduleRetryVerification({
      id,
      kind: 'color',
      label: 'couleur',
      expected: { color: normalized },
      issuedAt,
      resend: () => this.#sendColorCommand(id, normalized),
    });
  }

  #sendColorCommand(id, color) {
    const device = this.getDevice(id);
    this.#control(device, { msg: { cmd: 'colorwc', data: { color, colorTemInKelvin: 0 } } });
    this.#patchStatus(device.id, { color, colorTemInKelvin: 0 }, 'optimistic');
  }

  setColorTemperature(id, kelvin) {
    const colorTemInKelvin = clampInteger(kelvin, 2000, 9000, 'kelvin');
    const issuedAt = Date.now();
    this.#sendColorTemperatureCommand(id, colorTemInKelvin);
    this.#scheduleStatusRefresh(id);
    this.#scheduleRetryVerification({
      id,
      kind: 'color',
      label: 'température couleur',
      expected: { colorTemInKelvin },
      issuedAt,
      resend: () => this.#sendColorTemperatureCommand(id, colorTemInKelvin),
    });
  }

  #sendColorTemperatureCommand(id, colorTemInKelvin) {
    const device = this.getDevice(id);
    this.#control(device, { msg: { cmd: 'colorwc', data: { color: { r: 0, g: 0, b: 0 }, colorTemInKelvin } } });
    this.#patchStatus(device.id, { colorTemInKelvin }, 'optimistic');
  }

  queryStatus(id) {
    const device = this.getDevice(id);
    this.#control(device, { msg: { cmd: 'devStatus', data: {} } });
    this.#control(device, { msg: { cmd: 'status', data: {} } });
  }

  pollKnownDevices() {
    for (const device of this.devices.values()) {
      if (device.ip) {
        try { this.queryStatus(device.id); } catch (error) { console.warn(`[status] ${device.id}: ${error.message}`); }
      }
    }
  }

  emitDevices() {
    this.emit('devices', this.allDevices());
  }

  #sendJson(payload, port, host) {
    const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
    this.socket.send(buffer, 0, buffer.length, port, host, (error) => {
      if (error) {
        console.warn(`[udp:send] ${host}:${port} ${error.message}`);
        this.emit('errorMessage', `${host}:${port} ${error.message}`);
      }
    });
  }

  #control(device, payload) {
    if (!device.ip) throw httpError('Device has no IP address yet. Scan again or add it manually.', 400);
    this.#sendJson(payload, CONTROL_PORT, device.ip);
  }

  #scheduleStatusRefresh(id) {
    setTimeout(() => { try { this.queryStatus(id); } catch { } }, 800);
    setTimeout(() => { try { this.queryStatus(id); } catch { } }, 2_500);
  }

  // Optional reliability layer: after a command, read the status back and
  // resend the command while the device does not report the expected state.
  #scheduleRetryVerification({ id, kind, label, expected, issuedAt, resend, attempt = 0, token = crypto.randomUUID() }) {
    if (!this.retryMode || RETRY_MAX_ATTEMPTS <= 0) return;

    const retryKey = `${id}:${kind}`;
    if (attempt === 0) this.retryTokens.set(retryKey, token);

    setTimeout(() => {
      this.#verifyAndRetry({ id, kind, label, expected, issuedAt, resend, attempt, token }).catch((error) => {
        this.emit('errorMessage', `Retry ${label} failed for ${id}: ${error.message}`);
      });
    }, RETRY_VERIFY_DELAY_MS);
  }

  async #verifyAndRetry({ id, kind, label, expected, issuedAt, resend, attempt, token }) {
    const retryKey = `${id}:${kind}`;
    if (!this.retryMode || this.retryTokens.get(retryKey) !== token) return;

    try {
      this.queryStatus(id);
      await sleep(RETRY_STATUS_WAIT_MS);
    } catch { }

    const device = this.devices.get(id);
    if (this.#statusMatchesExpected(device, expected, issuedAt)) {
      if (this.retryTokens.get(retryKey) === token) this.retryTokens.delete(retryKey);
      return;
    }

    if (attempt >= RETRY_MAX_ATTEMPTS) {
      if (this.retryTokens.get(retryKey) === token) this.retryTokens.delete(retryKey);
      const statusAt = device?.lastStatusAt ? `dernier statut ${device.lastStatusAt}` : 'aucun statut récent';
      this.emit('errorMessage', `Retry LAN abandonné (${label}) pour ${device?.sku || 'Govee'} ${device?.ip || id}: ${statusAt}.`);
      return;
    }

    const nextAttempt = attempt + 1;
    const retriedAt = Date.now();
    resend();
    this.#scheduleStatusRefresh(id);
    this.emit('retry', {
      deviceId: id,
      kind,
      label,
      attempt: nextAttempt,
      maxAttempts: RETRY_MAX_ATTEMPTS,
      at: new Date(retriedAt).toISOString(),
    });
    this.#scheduleRetryVerification({ id, kind, label, expected, issuedAt: retriedAt, resend, attempt: nextAttempt, token });
  }

  #statusMatchesExpected(device, expected, issuedAt) {
    const statusAt = Date.parse(device?.lastStatusAt || '');
    if (!Number.isFinite(statusAt) || statusAt < issuedAt) return false;

    const status = device?.status || {};
    if (typeof expected.onOff === 'number' && status.onOff !== expected.onOff) return false;
    if (typeof expected.colorTemInKelvin === 'number' && status.colorTemInKelvin !== expected.colorTemInKelvin) return false;
    if (expected.color) {
      const color = status.color || {};
      if (color.r !== expected.color.r || color.g !== expected.color.g || color.b !== expected.color.b) return false;
    }

    return true;
  }

  #patchStatus(id, patch, source) {
    const device = this.devices.get(id);
    if (!device) return;
    device.status = { ...(device.status || {}), ...patch };
    device.statusSource = source;
    device.lastCommandAt = nowIso();
    this.devices.set(id, device);
    this.emitDevices();
  }

  #handleMessage(buffer, rinfo) {
    const text = buffer.toString('utf8').trim();
    let packet;
    try { packet = JSON.parse(text); } catch {
      console.warn(`[udp:message] Non-JSON packet from ${rinfo.address}:${rinfo.port}: ${text}`);
      return;
    }

    const cmd = packet?.msg?.cmd;
    const data = packet?.msg?.data || {};
    if (!cmd) return;

    if (cmd === 'scan') {
      const device = this.#upsertDiscoveredDevice(data, rinfo);
      console.log(`[discover] ${device.sku || 'Govee'} ${device.device || device.id} at ${device.ip}`);
      this.queryStatus(device.id);
      return;
    }

    if (cmd === 'devStatus' || cmd === 'status') {
      const device = [...this.devices.values()].find((entry) => entry.ip === rinfo.address);
      if (!device) {
        console.log(`[status] Received status from unknown IP ${rinfo.address}: ${text}`);
        return;
      }
      device.status = { ...(device.status || {}), ...data };
      device.statusSource = 'device';
      device.lastStatusAt = nowIso();
      device.lastSeen = nowIso();
      device.online = true;
      this.devices.set(device.id, device);
      this.emitDevices();
      return;
    }

    console.log(`[udp:message] ${rinfo.address}:${rinfo.port} ${text}`);
  }

  #upsertDiscoveredDevice(data, rinfo) {
    const id = data.device || `ip:${data.ip || rinfo.address}`;
    const previous = this.devices.get(id) || {};
    const device = {
      ...previous,
      id,
      ip: data.ip || rinfo.address,
      device: data.device || previous.device || id,
      sku: data.sku || previous.sku || 'Unknown',
      bleVersionHard: data.bleVersionHard || previous.bleVersionHard || null,
      bleVersionSoft: data.bleVersionSoft || previous.bleVersionSoft || null,
      wifiVersionHard: data.wifiVersionHard || previous.wifiVersionHard || null,
      wifiVersionSoft: data.wifiVersionSoft || previous.wifiVersionSoft || null,
      manual: Boolean(previous.manual),
      firstSeen: previous.firstSeen || nowIso(),
      lastSeen: nowIso(),
      online: true,
      raw: data,
    };
    this.devices.set(id, device);
    this.emitDevices();
    return device;
  }
}
