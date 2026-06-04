import crypto from 'node:crypto';
import dgram from 'node:dgram';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTTP_PORT = Number(process.env.PORT || 8787);
const MULTICAST_ADDRESS = process.env.GOVEE_MULTICAST_ADDRESS || '239.255.255.250';
const SCAN_PORT = Number(process.env.GOVEE_SCAN_PORT || 4001);
const LISTEN_PORT = Number(process.env.GOVEE_LISTEN_PORT || 4002);
const CONTROL_PORT = Number(process.env.GOVEE_CONTROL_PORT || 4003);
const AUTO_SCAN_INTERVAL_MS = Number(process.env.GOVEE_AUTOSCAN_INTERVAL_MS || 10_000);
const STATUS_POLL_INTERVAL_MS = Number(process.env.GOVEE_STATUS_POLL_INTERVAL_MS || 30_000);
const BLE_EVENT_ID_TTL_MS = Number(process.env.GOVEE_BLE_EVENT_ID_TTL_MS || 10 * 60 * 1000);
const BLE_FALLBACK_EVENT_WINDOW_MS = Number(process.env.GOVEE_BLE_FALLBACK_EVENT_WINDOW_MS || 9_000);
const BLE_DEFAULT_ENABLED = ['1', 'true', 'yes'].includes(String(process.env.GOVEE_BLE_ENABLED || '').toLowerCase());
const GOVEE_CLOUD_API_KEY = process.env.GOVEE_API_KEY || process.env.GOVEE_CLOUD_API_KEY || '';
const GOVEE_CLOUD_BASE_URL = process.env.GOVEE_CLOUD_BASE_URL || 'https://openapi.api.govee.com/router/api/v1';
const DEFAULT_SCAN_IPS = (process.env.GOVEE_SCAN_IPS || '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

const DIST_DIR = path.join(__dirname, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const BLE_PACKET_HISTORY_LIMIT = 240;
const BLE_EVENT_HISTORY_LIMIT = 80;
const RETRY_VERIFY_DELAY_MS = Number(process.env.GOVEE_RETRY_VERIFY_DELAY_MS || 1_600);
const RETRY_STATUS_WAIT_MS = Number(process.env.GOVEE_RETRY_STATUS_WAIT_MS || 700);
const RETRY_MAX_ATTEMPTS = Number(process.env.GOVEE_RETRY_MAX_ATTEMPTS || 2);

function defaultConfig() {
  return {
    bleEnabled: BLE_DEFAULT_ENABLED,
    bleActions: {},
    bleSensors: [],
    blePackets: [],
    bleEvents: [],
    scenes: [],
    cloudApiKey: '',
    retryMode: false,
  };
}

function normalizeConfig(config = {}) {
  const defaults = defaultConfig();
  return {
    ...defaults,
    ...config,
    bleEnabled: typeof config.bleEnabled === 'boolean' ? config.bleEnabled : defaults.bleEnabled,
    bleActions: config.bleActions && typeof config.bleActions === 'object' && !Array.isArray(config.bleActions) ? config.bleActions : {},
    bleSensors: Array.isArray(config.bleSensors) ? config.bleSensors : [],
    blePackets: Array.isArray(config.blePackets) ? config.blePackets : [],
    bleEvents: Array.isArray(config.bleEvents) ? config.bleEvents : [],
    scenes: Array.isArray(config.scenes) ? config.scenes : [],
    cloudApiKey: typeof config.cloudApiKey === 'string' ? config.cloudApiKey : '',
    retryMode: Boolean(config.retryMode),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

function clampInteger(value, min, max, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    const error = new Error(`${name} must be an integer between ${min} and ${max}`);
    error.statusCode = 400;
    throw error;
  }
  return n;
}

const DIRECT_PROTOCOLS = new Set([
  'razer',
  'razer-legacy',
  'dreamview',
  'dreamview-v2',
]);

function xorChecksum(bytes) {
  let checksum = 0;
  for (const byte of bytes) checksum ^= byte;
  return checksum & 0xff;
}

function encodePt(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function normalizeByte(value, name) {
  return clampInteger(value, 0, 255, name);
}

function normalizeRgbInteger(value, name = 'rgb') {
  if (Number.isInteger(value)) return clampInteger(value, 0, 0xffffff, name);
  const pixel = normalizePixel(value, 0);
  return ((pixel[0] & 0xff) << 16) | ((pixel[1] & 0xff) << 8) | (pixel[2] & 0xff);
}

function rgbIntegerToObject(value) {
  if (!Number.isInteger(value)) return null;
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function normalizePixel(pixel, index = 0) {
  if (Array.isArray(pixel)) {
    return [
      normalizeByte(pixel[0], `pixels[${index}][0]`),
      normalizeByte(pixel[1], `pixels[${index}][1]`),
      normalizeByte(pixel[2], `pixels[${index}][2]`),
    ];
  }

  return [
    normalizeByte(pixel?.r, `pixels[${index}].r`),
    normalizeByte(pixel?.g, `pixels[${index}].g`),
    normalizeByte(pixel?.b, `pixels[${index}].b`),
  ];
}

function repeatColorAsPixels(color, count) {
  const pixel = normalizePixel(color);
  return Array.from({ length: count }, () => [...pixel]);
}

function buildRazerModePacket(enable) {
  const value = enable ? 1 : 0;
  const bytes = [0xbb, 0x00, 0x01, 0xb1, value];
  bytes.push(xorChecksum(bytes));
  return { msg: { cmd: 'razer', data: { pt: encodePt(bytes) } } };
}

function buildRazerColorPacket(pixels, legacy = false) {
  const count = pixels.length;
  const bytes = [0xbb, 0x00, 0x0e, 0xb0, 0x01, count];
  for (const pixel of pixels) bytes.push(pixel[0], pixel[1], pixel[2]);
  bytes.push(legacy ? 0x00 : xorChecksum(bytes));
  return { msg: { cmd: 'razer', data: { pt: encodePt(bytes) } } };
}

function buildDreamViewPacket(pixels, { version = 1, gradientOff = 1 } = {}) {
  const opcode = version === 2 ? 0xb4 : 0xb0;
  const collection = [gradientOff ? 1 : 0, pixels.length];
  for (let i = 0; i < pixels.length; i += 1) {
    const pixel = pixels[i];
    collection.push(pixel[0], pixel[1], pixel[2]);
    if (version === 2) collection.push(i < 36 ? 1 : 2);
  }
  const bytes = [0xbb, (collection.length >> 8) & 0xff, collection.length & 0xff, opcode, ...collection];
  bytes.push(xorChecksum(bytes));
  return { msg: { cmd: 'razer', data: { pt: encodePt(bytes) } } };
}

function buildDirectColorPacket(protocol, pixels, options = {}) {
  if (!DIRECT_PROTOCOLS.has(protocol)) {
    const error = new Error(`Unsupported direct protocol: ${protocol}`);
    error.statusCode = 400;
    throw error;
  }

  if (protocol === 'razer') return buildRazerColorPacket(pixels, false);
  if (protocol === 'razer-legacy') return buildRazerColorPacket(pixels, true);
  if (protocol === 'dreamview') return buildDreamViewPacket(pixels, { version: 1, gradientOff: options.gradientOff ?? 1 });
  if (protocol === 'dreamview-v2') return buildDreamViewPacket(pixels, { version: 2, gradientOff: options.gradientOff ?? 1 });
  throw new Error(`Unhandled protocol: ${protocol}`);
}

function validateIpLike(ip) {
  if (typeof ip !== 'string' || !/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
    const error = new Error('ip must be an IPv4 address such as 192.168.1.42');
    error.statusCode = 400;
    throw error;
  }
  const parts = ip.split('.').map(Number);
  if (parts.some((part) => part < 0 || part > 255)) {
    const error = new Error('ip contains an invalid octet');
    error.statusCode = 400;
    throw error;
  }
  return ip;
}

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
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => {
      if (!iface.address || !iface.netmask) return null;
      const ip = ipv4ToInt(iface.address);
      const mask = ipv4ToInt(iface.netmask);
      const broadcast = (ip & mask) | (~mask >>> 0);
      return intToIpv4(broadcast >>> 0);
    })
    .filter(Boolean);
}

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

function decryptGoveeH512x(timeMs, encrypted) {
  const key = Buffer.concat([Buffer.from(timeMs), Buffer.alloc(12)]).reverse();
  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
  decipher.setAutoPadding(false);
  const decryptedReversed = Buffer.concat([
    decipher.update(Buffer.from(encrypted).reverse()),
    decipher.final(),
  ]);
  return decryptedReversed.reverse();
}

const H512X_MODELS = new Map([
  [3, { model: 'H5121', type: 'motion', buttons: 0 }],
  [8, { model: 'H5122', type: 'button', buttons: 1 }],
  [2, { model: 'H5123', type: 'window', buttons: 0 }],
  [9, { model: 'H5124', type: 'vibration', buttons: 0 }],
  [10, { model: 'H5125', type: 'button', buttons: 6 }],
  [11, { model: 'H5126', type: 'button', buttons: 2 }],
  [13, { model: 'H5130', type: 'pressure', buttons: 1 }],
]);

function parseH512xAdvertisement({ address, localName = '', rssi = null, manufacturerData }) {
  if (!Buffer.isBuffer(manufacturerData)) return null;

  let data = manufacturerData;
  if (data.length > 25 && data.includes(Buffer.from('INTELLI_ROCKS'))) data = data.subarray(0, -25);
  if (data.length !== 24) return null;

  const timeMs = data.subarray(2, 6);
  const eventId = timeMs.toString('hex');
  const eventCounter = timeMs.readUInt32BE(0);
  const encrypted = data.subarray(6, 22);
  const expectedCrc = data.readUInt16BE(22);
  if (calculateCrc(encrypted) !== expectedCrc) return null;

  let decrypted;
  try {
    decrypted = decryptGoveeH512x(timeMs, encrypted);
  } catch (error) {
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

  if (info.model !== 'H5122' && !['H5125', 'H5126'].includes(info.model)) {
    return null;
  }

  const battery = decrypted[4];
  const buttonNumber = decrypted[5];
  const now = new Date().toISOString();

  return {
    sensor: {
      id: address.toLowerCase(),
      address,
      name: localName || `${info.model} ${address.slice(-5)}`,
      model: info.model,
      type: info.type,
      buttonCount: info.buttons,
      battery,
      rssi,
      lastSeen: now,
      raw: {
        manufacturerData: data.toString('hex'),
        decrypted: decrypted.toString('hex'),
        timeMs: eventId,
        eventId,
        eventCounter,
        modelId,
        buttonNumber,
      },
    },
    event: {
      id: eventId,
      nonce: eventId,
      counter: eventCounter,
      type: 'press',
      button: buttonNumber,
      key: `button_${buttonNumber}`,
      battery,
    },
  };
}

function getManufacturerCandidates(advertisement) {
  const candidates = [];
  const data = advertisement?.manufacturerData;
  if (Buffer.isBuffer(data)) {
    if (data.length >= 26) {
      candidates.push({ companyId: data.readUInt16LE(0), data: data.subarray(2) });
    }
    candidates.push({ companyId: null, data });
  }
  return candidates;
}

async function readConfig() {
  try {
    return normalizeConfig(JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8')));
  } catch {
    return defaultConfig();
  }
}

async function writeConfig(config) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(normalizeConfig(config), null, 2));
}

let configWriteQueue = Promise.resolve();

async function updateConfig(mutator) {
  const run = configWriteQueue.then(async () => {
    const config = await readConfig();
    const nextConfig = await mutator(config) || config;
    await writeConfig(nextConfig);
    return normalizeConfig(nextConfig);
  });
  configWriteQueue = run.catch(() => {});
  return run;
}


function createSceneId(name) {
  const slug = String(name || 'scene')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'scene';
  return `${slug}-${Date.now().toString(36)}`;
}

function snapshotDevicesAsScene(devices, name) {
  const cleanName = typeof name === 'string' && name.trim() ? name.trim() : `Scene ${new Date().toLocaleString()}`;
  return {
    id: createSceneId(cleanName),
    name: cleanName,
    createdAt: new Date().toISOString(),
    devices: devices
      .filter((device) => device.ip && device.status)
      .map((device) => ({
        deviceId: device.id,
        label: device.sku ? `${device.sku} · ${device.ip || device.id}` : device.ip || device.id,
        sku: device.sku || null,
        ip: device.ip || null,
        onOff: typeof device.status?.onOff === 'number' ? device.status.onOff : null,
        brightness: typeof device.status?.brightness === 'number' ? device.status.brightness : null,
        color: device.status?.color || null,
        colorTemInKelvin: typeof device.status?.colorTemInKelvin === 'number' ? device.status.colorTemInKelvin : null,
      })),
  };
}

async function readScenes() {
  const config = await readConfig();
  return Array.isArray(config.scenes) ? config.scenes : [];
}

async function saveScene(scene) {
  const config = await updateConfig((currentConfig) => {
    currentConfig.scenes = [scene, ...currentConfig.scenes.filter((entry) => entry.id !== scene.id)].slice(0, 50);
    return currentConfig;
  });
  return config.scenes;
}

async function deleteScene(sceneId) {
  const config = await updateConfig((currentConfig) => {
    currentConfig.scenes = currentConfig.scenes.filter((scene) => scene.id !== sceneId);
    return currentConfig;
  });
  return config.scenes;
}

function encodeCloudId({ sku, device }) {
  return Buffer.from(`${sku || ''}\n${device || ''}`, 'utf8').toString('base64url');
}

function cloudCapability(capabilities, type, instance) {
  return (capabilities || []).find((capability) => (
    capability?.type === type && (!instance || capability.instance === instance)
  )) || null;
}

function cloudCapabilityValue(capability) {
  return capability?.state?.value ?? capability?.value ?? null;
}

function cloudPayloadCapabilities(response) {
  return response?.payload?.capabilities
    || response?.data?.capabilities
    || response?.payload?.payload?.capabilities
    || [];
}

function cloudDeviceEntries(response) {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.payload?.devices)) return response.payload.devices;
  if (Array.isArray(response?.data?.devices)) return response.data.devices;
  return [];
}

function extractCloudSceneOptions(payload, instance) {
  const capability = cloudCapability(cloudPayloadCapabilities(payload), 'devices.capabilities.dynamic_scene');
  const options = capability?.parameters?.options;
  if (!Array.isArray(options)) return [];
  return options.map((option) => ({
    name: option.name || String(option.value),
    value: typeof option.value === 'object' && option.value !== null ? option.value.id : option.value,
    instance,
  }));
}

function normalizeCloudState(payload) {
  const capabilities = cloudPayloadCapabilities(payload);
  const power = cloudCapability(capabilities, 'devices.capabilities.on_off', 'powerSwitch')
    || cloudCapability(capabilities, 'devices.capabilities.on_off');
  const brightness = cloudCapability(capabilities, 'devices.capabilities.range', 'brightness');
  const color = cloudCapability(capabilities, 'devices.capabilities.color_setting', 'colorRgb');
  const colorTemperature = cloudCapability(capabilities, 'devices.capabilities.color_setting', 'colorTemperatureK')
    || cloudCapability(capabilities, 'devices.capabilities.range', 'colorTemperatureK');

  return {
    onOff: cloudCapabilityValue(power),
    brightness: cloudCapabilityValue(brightness),
    color: rgbIntegerToObject(cloudCapabilityValue(color)),
    colorTemInKelvin: cloudCapabilityValue(colorTemperature),
    raw: payload,
  };
}

class GoveeCloudApi {
  constructor(envApiKey) {
    this.envApiKey = envApiKey;
    this.appApiKey = '';
    this.baseUrl = GOVEE_CLOUD_BASE_URL.replace(/\/$/, '');
    this.lastError = null;
  }

  get activeApiKey() {
    return this.appApiKey || this.envApiKey;
  }

  async init() {
    const config = await readConfig();
    this.appApiKey = config.cloudApiKey || '';
  }

  status() {
    const apiKey = this.activeApiKey;
    return {
      configured: Boolean(apiKey),
      configuredSource: this.appApiKey ? 'app' : this.envApiKey ? 'env' : null,
      keyPreview: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : null,
      baseUrl: this.baseUrl,
      lastError: this.lastError,
    };
  }

  async setApiKey(apiKey) {
    const cleanApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    const config = await updateConfig((currentConfig) => {
      currentConfig.cloudApiKey = cleanApiKey;
      return currentConfig;
    });
    this.appApiKey = config.cloudApiKey || '';
    this.lastError = null;
    return this.status();
  }

  ensureConfigured() {
    if (!this.activeApiKey) {
      const error = new Error('Configure a Govee API key in the app or with GOVEE_API_KEY/GOVEE_CLOUD_API_KEY.');
      error.statusCode = 400;
      throw error;
    }
  }

  async request(pathname, { method = 'GET', payload } = {}) {
    this.ensureConfigured();
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'Govee-API-Key': this.activeApiKey,
      },
      body: payload === undefined ? undefined : JSON.stringify({
        requestId: crypto.randomUUID(),
        payload,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || (data.code && data.code !== 200 && data.code !== '200')) {
      const error = new Error(data.message || data.msg || `Govee cloud API failed with HTTP ${response.status}`);
      error.statusCode = response.ok ? 502 : response.status;
      error.payload = data;
      this.lastError = error.message;
      throw error;
    }
    this.lastError = null;
    return data;
  }

  async listDevices({ includeState = true } = {}) {
    const data = await this.request('/user/devices');
    const entries = cloudDeviceEntries(data);
    const devices = entries.map((device) => ({
      id: `cloud:${encodeCloudId(device)}`,
      source: 'cloud',
      sku: device.sku || null,
      device: device.device || null,
      name: device.deviceName || device.name || device.device || device.sku || 'Govee cloud',
      type: device.type || null,
      capabilities: device.capabilities || [],
      raw: device,
      status: null,
      statusError: null,
    }));

    if (!includeState) return devices;

    const settled = await Promise.allSettled(devices.map(async (device) => ({
      ...device,
      status: await this.getState({ sku: device.sku, device: device.device }),
    })));

    return settled.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      return {
        ...devices[index],
        statusError: result.reason?.message || 'Unable to read cloud state',
      };
    });
  }

  async getState({ sku, device }) {
    const data = await this.request('/device/state', {
      method: 'POST',
      payload: { sku, device },
    });
    return normalizeCloudState(data);
  }

  async getScenes({ sku, device }) {
    const [lightResult, diyResult] = await Promise.allSettled([
      this.request('/device/scenes', { method: 'POST', payload: { sku, device } }),
      this.request('/device/diy-scenes', { method: 'POST', payload: { sku, device } }),
    ]);
    const lightScenes = lightResult.status === 'fulfilled' ? extractCloudSceneOptions(lightResult.value, 'lightScene') : [];
    const diyScenes = diyResult.status === 'fulfilled' ? extractCloudSceneOptions(diyResult.value, 'diyScene') : [];
    return {
      lightScenes,
      diyScenes,
      scenes: [...lightScenes, ...diyScenes],
      errors: [lightResult, diyResult]
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason?.message || 'Scene query failed'),
    };
  }

  async control({ sku, device, capability }) {
    return this.request('/device/control', {
      method: 'POST',
      payload: { sku, device, capability },
    });
  }

  async applyAction({ sku, device, action, ...body }) {
    if (action === 'power') {
      return this.control({
        sku,
        device,
        capability: {
          type: 'devices.capabilities.on_off',
          instance: 'powerSwitch',
          value: body.on ? 1 : 0,
        },
      });
    }

    if (action === 'brightness') {
      return this.control({
        sku,
        device,
        capability: {
          type: 'devices.capabilities.range',
          instance: 'brightness',
          value: clampInteger(body.value, 1, 100, 'brightness'),
        },
      });
    }

    if (action === 'color') {
      return this.control({
        sku,
        device,
        capability: {
          type: 'devices.capabilities.color_setting',
          instance: 'colorRgb',
          value: normalizeRgbInteger(body.color ?? body, 'color'),
        },
      });
    }

    if (action === 'color-temperature') {
      return this.control({
        sku,
        device,
        capability: {
          type: 'devices.capabilities.color_setting',
          instance: 'colorTemperatureK',
          value: clampInteger(body.kelvin, 1000, 10000, 'kelvin'),
        },
      });
    }

    if (action === 'scene') {
      return this.control({
        sku,
        device,
        capability: {
          type: 'devices.capabilities.dynamic_scene',
          instance: body.instance || 'lightScene',
          value: clampInteger(body.value, 0, Number.MAX_SAFE_INTEGER, 'scene'),
        },
      });
    }

    if (action === 'segment-color') {
      return this.control({
        sku,
        device,
        capability: {
          type: 'devices.capabilities.segment_color_setting',
          instance: 'segmentedColorRgb',
          value: {
            segment: Array.isArray(body.segment) ? body.segment.map((entry) => clampInteger(entry, 0, 512, 'segment')) : [clampInteger(body.segment, 0, 512, 'segment')],
            rgb: normalizeRgbInteger(body.color ?? body.rgb, 'rgb'),
          },
        },
      });
    }

    if (action === 'segment-brightness') {
      return this.control({
        sku,
        device,
        capability: {
          type: 'devices.capabilities.segment_color_setting',
          instance: 'segmentedBrightness',
          value: {
            segment: Array.isArray(body.segment) ? body.segment.map((entry) => clampInteger(entry, 0, 512, 'segment')) : [clampInteger(body.segment, 0, 512, 'segment')],
            brightness: clampInteger(body.brightness, 1, 100, 'brightness'),
          },
        },
      });
    }

    if (action === 'gradient') {
      return this.control({
        sku,
        device,
        capability: {
          type: 'devices.capabilities.toggle',
          instance: 'gradientToggle',
          value: body.enabled ? 1 : 0,
        },
      });
    }

    if (action === 'music-mode') {
      return this.control({
        sku,
        device,
        capability: {
          type: 'devices.capabilities.music_setting',
          instance: 'musicMode',
          value: {
            musicMode: clampInteger(body.mode, 0, Number.MAX_SAFE_INTEGER, 'mode'),
            sensitivity: clampInteger(body.sensitivity, 0, 100, 'sensitivity'),
            autoColor: body.autoColor ? 1 : 0,
            rgb: normalizeRgbInteger(body.color ?? body.rgb ?? 0, 'rgb'),
          },
        },
      });
    }

    const error = new Error(`Unknown cloud action: ${action}`);
    error.statusCode = 400;
    throw error;
  }
}

class GoveeLanBridge extends EventEmitter {
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

    this.emit('scan', { multicast: MULTICAST_ADDRESS, broadcasts: broadcastTargets, ips: uniqueIps, at: new Date().toISOString() });
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
      firstSeen: existing.firstSeen || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
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
    if (!device) {
      const error = new Error('Unknown device. Run a scan first or add it manually by IP.');
      error.statusCode = 404;
      throw error;
    }
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

  setColor(id, { r, g, b }) {
    const color = { r: clampInteger(r, 0, 255, 'r'), g: clampInteger(g, 0, 255, 'g'), b: clampInteger(b, 0, 255, 'b') };
    const issuedAt = Date.now();
    this.#sendColorCommand(id, color);
    this.#scheduleStatusRefresh(id);
    this.#scheduleRetryVerification({
      id,
      kind: 'color',
      label: 'couleur',
      expected: { color },
      issuedAt,
      resend: () => this.#sendColorCommand(id, color),
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

  setDirectMode(id, enabled) {
    const device = this.getDevice(id);
    this.#control(device, buildRazerModePacket(Boolean(enabled)));
    this.#patchStatus(device.id, { directModeRequested: Boolean(enabled) }, 'optimistic-direct');
    this.#scheduleStatusRefresh(device.id);
  }

  setDirectColor(id, { protocol = 'razer', r, g, b, ledCount = 1, gradientOff = 1 } = {}) {
    const count = clampInteger(ledCount, 1, 512, 'ledCount');
    const pixels = repeatColorAsPixels({ r, g, b }, count);
    this.setDirectPixels(id, { protocol, pixels, gradientOff });
  }

  setDirectPixels(id, { protocol = 'razer', pixels, gradientOff = 1 } = {}) {
    const device = this.getDevice(id);
    if (!Array.isArray(pixels) || pixels.length < 1) {
      const error = new Error('pixels must be a non-empty array');
      error.statusCode = 400;
      throw error;
    }
    if (pixels.length > 512) {
      const error = new Error('pixels is too large; keep it to 512 or less');
      error.statusCode = 400;
      throw error;
    }

    const normalizedPixels = pixels.map((pixel, index) => normalizePixel(pixel, index));
    if (protocol !== 'razer-legacy') this.#control(device, buildRazerModePacket(true));

    const gradientValue = Number(gradientOff) ? 1 : 0;
    const packet = buildDirectColorPacket(protocol, normalizedPixels, { gradientOff: gradientValue });
    this.#control(device, packet);
    this.#patchStatus(device.id, {
      directProtocol: protocol,
      directLedCount: normalizedPixels.length,
      directGradientOff: gradientValue,
      color: { r: normalizedPixels[0][0], g: normalizedPixels[0][1], b: normalizedPixels[0][2] },
      colorTemInKelvin: 0,
    }, 'optimistic-direct');
    this.#scheduleStatusRefresh(device.id);
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

  setAllPower(on) {
    const results = [];
    for (const device of this.devices.values()) {
      if (!device.ip) continue;
      try {
        this.setPower(device.id, on);
        results.push({ deviceId: device.id, ok: true });
      } catch (error) {
        results.push({ deviceId: device.id, ok: false, error: error.message });
      }
    }
    return results;
  }

  setAllBrightness(value) {
    const results = [];
    for (const device of this.devices.values()) {
      if (!device.ip) continue;
      try {
        this.setBrightness(device.id, value);
        results.push({ deviceId: device.id, ok: true });
      } catch (error) {
        results.push({ deviceId: device.id, ok: false, error: error.message });
      }
    }
    return results;
  }

  setAllColor(color) {
    const results = [];
    for (const device of this.devices.values()) {
      if (!device.ip) continue;
      try {
        this.setColor(device.id, color);
        results.push({ deviceId: device.id, ok: true });
      } catch (error) {
        results.push({ deviceId: device.id, ok: false, error: error.message });
      }
    }
    return results;
  }

  applyScene(scene) {
    const results = [];
    for (const entry of scene.devices || []) {
      try {
        const device = this.getDevice(entry.deviceId);
        if (!device.ip) throw new Error('Device has no IP address');
        if (typeof entry.onOff === 'number') {
          this.setPower(entry.deviceId, entry.onOff === 1);
          if (entry.onOff === 0) {
            results.push({ deviceId: entry.deviceId, ok: true });
            continue;
          }
        }
        if (typeof entry.brightness === 'number') this.setBrightness(entry.deviceId, entry.brightness);
        if (entry.color && typeof entry.color.r === 'number') this.setColor(entry.deviceId, entry.color);
        else if (typeof entry.colorTemInKelvin === 'number' && entry.colorTemInKelvin > 0) this.setColorTemperature(entry.deviceId, entry.colorTemInKelvin);
        results.push({ deviceId: entry.deviceId, ok: true });
      } catch (error) {
        results.push({ deviceId: entry.deviceId, ok: false, error: error.message });
      }
    }
    return results;
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
    if (!device.ip) {
      const error = new Error('Device has no IP address yet. Scan again or add it manually.');
      error.statusCode = 400;
      throw error;
    }
    this.#sendJson(payload, CONTROL_PORT, device.ip);
  }

  #scheduleStatusRefresh(id) {
    setTimeout(() => { try { this.queryStatus(id); } catch { } }, 800);
    setTimeout(() => { try { this.queryStatus(id); } catch { } }, 2_500);
  }

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
    const previous = device.status || {};
    device.status = { ...previous, ...patch };
    device.statusSource = source;
    device.lastCommandAt = new Date().toISOString();
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
      const device = this.#findByIp(rinfo.address);
      if (!device) {
        console.log(`[status] Received status from unknown IP ${rinfo.address}: ${text}`);
        return;
      }
      const previousStatus = device.status || {};
      device.status = { ...previousStatus, ...data };
      device.statusSource = 'device';
      device.lastStatusAt = new Date().toISOString();
      device.lastSeen = new Date().toISOString();
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
      firstSeen: previous.firstSeen || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      online: true,
      raw: data,
    };
    this.devices.set(id, device);
    this.emitDevices();
    return device;
  }

  #findByIp(ip) {
    return [...this.devices.values()].find((device) => device.ip === ip);
  }
}

class GoveeBleBridge extends EventEmitter {
  constructor(goveeLan) {
    super();
    this.goveeLan = goveeLan;
    this.noble = null;
    this.available = false;
    this.enabled = false;
    this.scanning = false;
    this.error = null;
    this.sensors = new Map();
    this.actions = new Map();
    this.lastEventAt = new Map();
    this.seenBleEvents = new Map();
    this.packets = [];
    this.events = [];
    this.persistTimer = null;
    this.config = defaultConfig();
  }

  async init() {
    this.config = await readConfig();
    this.actions = new Map(Object.entries(this.config.bleActions || {}));
    this.packets = this.config.blePackets.slice(0, BLE_PACKET_HISTORY_LIMIT);
    this.events = this.config.bleEvents.slice(0, BLE_EVENT_HISTORY_LIMIT);
    this.sensors = new Map(
      this.config.bleSensors
        .filter((sensor) => sensor?.id)
        .map((sensor) => [sensor.id, { ...sensor, action: this.actions.get(sensor.id) || sensor.action || null }]),
    );
    try {
      const imported = await import('@stoprocent/noble');
      this.noble = imported.default || imported;
      this.available = true;
      this.noble.on('stateChange', (state) => this.#onStateChange(state));
      this.noble.on('discover', (peripheral) => this.#onDiscover(peripheral));
      if (this.config.bleEnabled) await this.setEnabled(true);
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

  allSensors() {
    return [...this.sensors.values()].sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
  }

  allPackets() {
    return [...this.packets].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  allEvents() {
    return [...this.events].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  async setEnabled(enabled) {
    if (!this.available || !this.noble) {
      const error = new Error(this.error || 'Bluetooth is not available on this server.');
      error.statusCode = 503;
      throw error;
    }

    this.enabled = Boolean(enabled);
    await this.#persistBleState();

    if (this.enabled) this.#startScanWhenPoweredOn();
    else this.#stopScan();
    this.emitStatus();
  }

  async setAction(sensorId, action) {
    const normalized = this.#normalizeAction(action);
    this.actions.set(sensorId, normalized);
    const sensor = this.sensors.get(sensorId);
    if (sensor) {
      sensor.action = normalized;
      this.sensors.set(sensorId, sensor);
      this.emitSensors();
    }
    await this.#persistBleState();
    return normalized;
  }

  async testAction(sensorId, actionOverride) {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) {
      const error = new Error('Unknown BLE sensor');
      error.statusCode = 404;
      throw error;
    }
    const action = actionOverride ? this.#normalizeAction(actionOverride) : this.actions.get(sensorId);
    if (!action) {
      const error = new Error('No action configured for this BLE sensor');
      error.statusCode = 400;
      throw error;
    }
    const event = {
      id: `manual-test-${Date.now().toString(36)}`,
      type: 'manual-test',
      key: 'manual-test',
      button: null,
      battery: sensor.battery ?? null,
    };
    await this.#executeAction(sensor, event, action);
    const payload = { sensor, event, action, duplicate: false, test: true, at: new Date().toISOString() };
    this.#rememberEvent(payload);
    this.emit('buttonEvent', payload);
    return payload;
  }

  async flush() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.#persistBleState();
  }

  #normalizeAction(action = {}) {
    const mode = ['smart-toggle', 'toggle-cached', 'turn-on', 'turn-off'].includes(action.mode) ? action.mode : 'smart-toggle';
    if (typeof action.targetDeviceId !== 'string' || !action.targetDeviceId.trim()) {
      const error = new Error('targetDeviceId is required');
      error.statusCode = 400;
      throw error;
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
    const candidates = getManufacturerCandidates(advertisement);

    for (const candidate of candidates) {
      const parsed = parseH512xAdvertisement({
        address,
        localName,
        rssi: peripheral.rssi,
        manufacturerData: candidate.data,
      });
      if (!parsed) continue;

      const action = this.actions.get(parsed.sensor.id) || null;
      const sensor = { ...(this.sensors.get(parsed.sensor.id) || {}), ...parsed.sensor, action };
      this.sensors.set(sensor.id, sensor);
      this.emitSensors();
      this.#handleButtonEvent(sensor, parsed.event);
      return;
    }
  }

  #handleButtonEvent(sensor, event) {
    const now = Date.now();
    const duplicate = this.#isDuplicateButtonEvent(sensor, event, now);
    const packet = { sensor, event, duplicate, at: new Date(now).toISOString() };
    this.#rememberPacket(packet);
    this.emit('buttonPacket', packet);
    if (duplicate) return;

    const payload = { sensor, event, duplicate, at: packet.at };
    console.log(`[ble:event] ${sensor.model} ${sensor.address} ${event.key} ${event.id || 'no-event-id'}`);
    this.#rememberEvent(payload);
    this.emit('buttonEvent', payload);

    const action = this.actions.get(sensor.id);
    if (action) {
      this.#executeAction(sensor, event, action).catch((error) => {
        this.emit('errorMessage', `BLE action failed for ${sensor.name}: ${error.message}`);
      });
    }
  }

  #rememberPacket(packet) {
    this.packets = [packet, ...this.packets].slice(0, BLE_PACKET_HISTORY_LIMIT);
    this.#persistBleStateSoon();
  }

  #rememberEvent(event) {
    this.events = [event, ...this.events].slice(0, BLE_EVENT_HISTORY_LIMIT);
    this.#persistBleStateSoon();
  }

  #persistBleStateSoon() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.#persistBleState().catch((error) => {
        this.emit('errorMessage', `BLE history persistence failed: ${error.message}`);
      });
    }, 250);
  }

  async #persistBleState() {
    const config = await updateConfig((currentConfig) => {
      currentConfig.bleEnabled = this.enabled;
      currentConfig.bleActions = Object.fromEntries(this.actions.entries());
      currentConfig.bleSensors = this.allSensors();
      currentConfig.blePackets = this.allPackets().slice(0, BLE_PACKET_HISTORY_LIMIT);
      currentConfig.bleEvents = this.allEvents().slice(0, BLE_EVENT_HISTORY_LIMIT);
      return currentConfig;
    });
    this.config = config;
  }

  #isDuplicateButtonEvent(sensor, event, now) {
    this.#purgeSeenBleEvents(now);

    if (event.id) {
      const key = `${sensor.id}:${event.key}:${event.id}`;
      if (this.seenBleEvents.has(key)) return true;
      this.seenBleEvents.set(key, now);
      return false;
    }

    const fallbackKey = `${sensor.id}:${event.key}:fallback`;
    const last = this.lastEventAt.get(fallbackKey) || 0;
    if (now - last < BLE_FALLBACK_EVENT_WINDOW_MS) return true;
    this.lastEventAt.set(fallbackKey, now);
    return false;
  }

  #purgeSeenBleEvents(now) {
    for (const [key, seenAt] of this.seenBleEvents) {
      if (now - seenAt > BLE_EVENT_ID_TTL_MS) this.seenBleEvents.delete(key);
    }
  }

  async #executeAction(sensor, event, action) {

    if (action.mode === 'turn-on') {
      this.goveeLan.setPower(action.targetDeviceId, true);
    } else if (action.mode === 'turn-off') {
      this.goveeLan.setPower(action.targetDeviceId, false);
    } else if (action.mode === 'toggle-cached') {
      const current = this.goveeLan.getKnownPower(action.targetDeviceId);
      const nextOn = current === null ? action.fallbackOnUnknown : current !== 1;
      this.goveeLan.setPower(action.targetDeviceId, nextOn);
    } else {
      await this.goveeLan.smartToggle(action.targetDeviceId, { fallbackOnUnknown: action.fallbackOnUnknown, freshRead: true });
    }

    this.emit('actionExecuted', { sensor, event, action, at: new Date().toISOString() });
  }

  emitStatus() {
    this.emit('status', this.status());
  }

  emitSensors() {
    this.emit('sensors', this.allSensors());
  }
}

const govee = new GoveeLanBridge();
const cloud = new GoveeCloudApi(GOVEE_CLOUD_API_KEY);
const ble = new GoveeBleBridge(govee);
const sseClients = new Set();

function broadcastEvent(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(payload);
}

govee.on('devices', (devices) => broadcastEvent('devices', { devices }));
govee.on('scan', (scan) => broadcastEvent('scan', scan));
govee.on('settings', (settings) => broadcastEvent('settings', { settings }));
govee.on('retry', (retry) => broadcastEvent('retry', retry));
govee.on('errorMessage', (message) => broadcastEvent('error', { message }));
ble.on('status', (status) => broadcastEvent('ble-status', { status }));
ble.on('sensors', (sensors) => broadcastEvent('ble-sensors', { sensors }));
ble.on('buttonPacket', (payload) => broadcastEvent('ble-packet', payload));
ble.on('buttonEvent', (payload) => broadcastEvent('ble-event', payload));
ble.on('actionExecuted', (payload) => broadcastEvent('ble-action', payload));
ble.on('errorMessage', (message) => broadcastEvent('error', { message }));

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(DIST_DIR, pathname));
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.json': 'application/json; charset=utf-8',
      '.ico': 'image/x-icon',
    };
    res.writeHead(200, { 'content-type': contentTypes[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT' && pathname !== '/index.html') {
      req.url = '/';
      await serveStatic(req, res);
    } else if (error.code === 'ENOENT') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>Govee Control Hub</title><body style="font-family:system-ui;padding:2rem"><h1>Frontend not built yet</h1><p>Run <code>bun run dev</code> during development, or <code>bun run build && bun run start</code> for production.</p></body>');
    } else {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error.message);
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write(`event: devices\ndata: ${JSON.stringify({ devices: govee.allDevices() })}\n\n`);
      res.write(`event: settings\ndata: ${JSON.stringify({ settings: govee.settings() })}\n\n`);
      res.write(`event: ble-status\ndata: ${JSON.stringify({ status: ble.status() })}\n\n`);
      res.write(`event: ble-sensors\ndata: ${JSON.stringify({ sensors: ble.allSensors() })}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (url.pathname === '/api/devices' && req.method === 'GET') {
      jsonResponse(res, 200, { devices: govee.allDevices() });
      return;
    }

    if (url.pathname === '/api/settings' && req.method === 'GET') {
      jsonResponse(res, 200, { settings: govee.settings() });
      return;
    }

    if (url.pathname === '/api/settings' && req.method === 'POST') {
      const body = await readJsonBody(req);
      jsonResponse(res, 200, { ok: true, settings: await govee.setSettings(body) });
      return;
    }

    if (url.pathname === '/api/cloud/status' && req.method === 'GET') {
      jsonResponse(res, 200, { status: cloud.status() });
      return;
    }

    if (url.pathname === '/api/cloud/api-key' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const status = await cloud.setApiKey(body.apiKey ?? body.key ?? '');
      jsonResponse(res, 200, { ok: true, status });
      return;
    }

    if (url.pathname === '/api/cloud/devices' && req.method === 'GET') {
      if (!cloud.status().configured) {
        jsonResponse(res, 200, { status: cloud.status(), devices: [] });
        return;
      }
      const includeState = url.searchParams.get('state') !== '0';
      jsonResponse(res, 200, { status: cloud.status(), devices: await cloud.listDevices({ includeState }) });
      return;
    }

    if (url.pathname === '/api/cloud/device-state' && req.method === 'POST') {
      const body = await readJsonBody(req);
      jsonResponse(res, 200, { ok: true, status: await cloud.getState(body) });
      return;
    }

    if (url.pathname === '/api/cloud/device-scenes' && req.method === 'POST') {
      const body = await readJsonBody(req);
      jsonResponse(res, 200, { ok: true, ...(await cloud.getScenes(body)) });
      return;
    }

    if (url.pathname === '/api/cloud/device-action' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = await cloud.applyAction(body);
      jsonResponse(res, 200, { ok: true, result });
      return;
    }

    if (url.pathname === '/api/ble/status' && req.method === 'GET') {
      jsonResponse(res, 200, {
        status: ble.status(),
        sensors: ble.allSensors(),
        packets: ble.allPackets(),
        events: ble.allEvents(),
      });
      return;
    }

    if (url.pathname === '/api/ble/enable' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (typeof body.enabled !== 'boolean') {
        const error = new Error('enabled must be a boolean');
        error.statusCode = 400;
        throw error;
      }
      await ble.setEnabled(body.enabled);
      jsonResponse(res, 200, { ok: true, status: ble.status() });
      return;
    }

    const bleActionMatch = url.pathname.match(/^\/api\/ble\/sensors\/([^/]+)\/action$/);
    if (bleActionMatch && req.method === 'POST') {
      const sensorId = decodeURIComponent(bleActionMatch[1]);
      const body = await readJsonBody(req);
      const action = await ble.setAction(sensorId, body);
      jsonResponse(res, 200, { ok: true, action, sensors: ble.allSensors() });
      return;
    }

    const bleTestActionMatch = url.pathname.match(/^\/api\/ble\/sensors\/([^/]+)\/test-action$/);
    if (bleTestActionMatch && req.method === 'POST') {
      const sensorId = decodeURIComponent(bleTestActionMatch[1]);
      const body = await readJsonBody(req);
      const payload = await ble.testAction(sensorId, body.action || body);
      jsonResponse(res, 200, { ok: true, payload });
      return;
    }

    if (url.pathname === '/api/scenes' && req.method === 'GET') {
      jsonResponse(res, 200, { scenes: await readScenes() });
      return;
    }

    if (url.pathname === '/api/scenes/snapshot' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const scene = snapshotDevicesAsScene(govee.allDevices(), body.name);
      if (scene.devices.length === 0) {
        const error = new Error('No LAN device with a known status can be saved in a scene yet. Scan/read status first.');
        error.statusCode = 400;
        throw error;
      }
      const scenes = await saveScene(scene);
      jsonResponse(res, 200, { ok: true, scene, scenes });
      return;
    }

    const sceneActionMatch = url.pathname.match(/^\/api\/scenes\/([^/]+)\/(apply|delete)$/);
    if (sceneActionMatch && req.method === 'POST') {
      const sceneId = decodeURIComponent(sceneActionMatch[1]);
      const action = sceneActionMatch[2];
      const scenes = await readScenes();
      const scene = scenes.find((entry) => entry.id === sceneId);
      if (!scene) {
        const error = new Error('Unknown scene');
        error.statusCode = 404;
        throw error;
      }
      if (action === 'apply') {
        const results = govee.applyScene(scene);
        jsonResponse(res, 200, { ok: true, scene, results, devices: govee.allDevices() });
      } else {
        const updatedScenes = await deleteScene(sceneId);
        jsonResponse(res, 200, { ok: true, scenes: updatedScenes });
      }
      return;
    }

    if (url.pathname === '/api/actions/all-power' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (typeof body.on !== 'boolean') {
        const error = new Error('on must be a boolean');
        error.statusCode = 400;
        throw error;
      }
      jsonResponse(res, 200, { ok: true, results: govee.setAllPower(body.on), devices: govee.allDevices() });
      return;
    }

    if (url.pathname === '/api/actions/all-brightness' && req.method === 'POST') {
      const body = await readJsonBody(req);
      jsonResponse(res, 200, { ok: true, results: govee.setAllBrightness(body.value), devices: govee.allDevices() });
      return;
    }

    if (url.pathname === '/api/actions/all-color' && req.method === 'POST') {
      const body = await readJsonBody(req);
      jsonResponse(res, 200, { ok: true, results: govee.setAllColor(body), devices: govee.allDevices() });
      return;
    }

    if (url.pathname === '/api/scan' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const ips = Array.isArray(body.ips) ? body.ips.map(validateIpLike) : [];
      govee.scan({ ips });
      jsonResponse(res, 200, { ok: true, message: 'Scan packet sent', ips });
      return;
    }

    if (url.pathname === '/api/manual-device' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const ip = validateIpLike(body.ip);
      const entry = govee.addManualDevice({
        ip,
        device: typeof body.device === 'string' && body.device.trim() ? body.device.trim() : undefined,
        sku: typeof body.sku === 'string' && body.sku.trim() ? body.sku.trim() : undefined,
      });
      jsonResponse(res, 200, { ok: true, device: entry });
      return;
    }

    const deviceActionMatch = url.pathname.match(
      /^\/api\/devices\/([^/]+)\/(power|smart-toggle|brightness|color|color-temperature|status|direct-mode|direct-color|direct-pixels)$/,
    );
    if (deviceActionMatch && req.method === 'POST') {
      const id = decodeURIComponent(deviceActionMatch[1]);
      const action = deviceActionMatch[2];
      const body = await readJsonBody(req);

      if (action === 'power') {
        if (typeof body.on !== 'boolean') {
          const error = new Error('on must be a boolean');
          error.statusCode = 400;
          throw error;
        }
        govee.setPower(id, body.on);
      } else if (action === 'smart-toggle') {
        await govee.smartToggle(id, { fallbackOnUnknown: body.fallbackOnUnknown !== false, freshRead: body.freshRead !== false });
      } else if (action === 'brightness') {
        govee.setBrightness(id, body.value);
      } else if (action === 'color') {
        govee.setColor(id, body);
      } else if (action === 'color-temperature') {
        govee.setColorTemperature(id, body.kelvin);
      } else if (action === 'status') {
        govee.queryStatus(id);
      } else if (action === 'direct-mode') {
        if (typeof body.enabled !== 'boolean') {
          const error = new Error('enabled must be a boolean');
          error.statusCode = 400;
          throw error;
        }
        govee.setDirectMode(id, body.enabled);
      } else if (action === 'direct-color') {
        govee.setDirectColor(id, body);
      } else if (action === 'direct-pixels') {
        govee.setDirectPixels(id, body);
      }

      jsonResponse(res, 200, { ok: true, devices: govee.allDevices() });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      jsonResponse(res, 404, { ok: false, error: 'Unknown API route' });
      return;
    }

    if (req.method === 'GET') {
      await serveStatic(req, res);
      return;
    }

    jsonResponse(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    jsonResponse(res, error.statusCode || 500, { ok: false, error: error.message });
  }
});

server.listen(HTTP_PORT, async () => {
  console.log(`[web] http://localhost:${HTTP_PORT}`);
  await cloud.init();
  await govee.init();
  govee.start();
  await ble.init();
});

async function shutdown() {
  console.log('\n[shutdown] Closing sockets...');
  try { await ble.flush(); } catch { }
  try { govee.stop(); } catch { }
  try { ble.noble?.stopScanning?.(); } catch { }
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
