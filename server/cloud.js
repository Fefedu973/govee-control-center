import crypto from 'node:crypto';
import { CLOUD_API_KEY_ENV, CLOUD_BASE_URL } from './env.js';
import { readConfig, updateConfig } from './store.js';
import { clampInteger, httpError, integerToRgb, normalizeRgb, rgbToInteger } from './util.js';

function capabilityOf(capabilities, type, instance) {
  return (capabilities || []).find((capability) => (
    capability?.type === type && (!instance || capability.instance === instance)
  )) || null;
}

function capabilityValue(capability) {
  return capability?.state?.value ?? capability?.value ?? null;
}

function payloadCapabilities(response) {
  return response?.payload?.capabilities
    || response?.data?.capabilities
    || response?.payload?.payload?.capabilities
    || [];
}

function deviceEntries(response) {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.payload?.devices)) return response.payload.devices;
  if (Array.isArray(response?.data?.devices)) return response.data.devices;
  return [];
}

function extractSceneOptions(payload, instance) {
  const capability = capabilityOf(payloadCapabilities(payload), 'devices.capabilities.dynamic_scene');
  const options = capability?.parameters?.options;
  if (!Array.isArray(options)) return [];
  return options.map((option) => ({
    name: option.name || String(option.value),
    value: typeof option.value === 'object' && option.value !== null ? option.value.id : option.value,
    instance,
  }));
}

export function normalizeCloudState(payload) {
  const capabilities = payloadCapabilities(payload);
  const power = capabilityOf(capabilities, 'devices.capabilities.on_off', 'powerSwitch')
    || capabilityOf(capabilities, 'devices.capabilities.on_off');
  const brightness = capabilityOf(capabilities, 'devices.capabilities.range', 'brightness');
  const color = capabilityOf(capabilities, 'devices.capabilities.color_setting', 'colorRgb');
  const colorTemperature = capabilityOf(capabilities, 'devices.capabilities.color_setting', 'colorTemperatureK')
    || capabilityOf(capabilities, 'devices.capabilities.range', 'colorTemperatureK');

  return {
    onOff: capabilityValue(power),
    brightness: capabilityValue(brightness),
    color: integerToRgb(capabilityValue(color)),
    colorTemInKelvin: capabilityValue(colorTemperature),
  };
}

/**
 * Client for the official Govee Cloud API (openapi.api.govee.com).
 * The API key comes from the app config first, then from the environment.
 */
export class GoveeCloudApi {
  constructor(envApiKey = CLOUD_API_KEY_ENV) {
    this.envApiKey = envApiKey;
    this.appApiKey = '';
    this.baseUrl = CLOUD_BASE_URL;
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
      throw httpError('Configure a Govee API key in the app or with GOVEE_API_KEY.', 400);
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
      const error = httpError(
        data.message || data.msg || `Govee cloud API failed with HTTP ${response.status}`,
        response.ok ? 502 : response.status,
      );
      error.payload = data;
      this.lastError = error.message;
      throw error;
    }
    this.lastError = null;
    return data;
  }

  async listDevices({ includeState = true } = {}) {
    const data = await this.request('/user/devices');
    const devices = deviceEntries(data).map((device) => ({
      sku: device.sku || null,
      device: device.device || null,
      name: device.deviceName || device.name || device.device || device.sku || 'Govee cloud',
      type: device.type || null,
      capabilities: device.capabilities || [],
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
    const lightScenes = lightResult.status === 'fulfilled' ? extractSceneOptions(lightResult.value, 'lightScene') : [];
    const diyScenes = diyResult.status === 'fulfilled' ? extractSceneOptions(diyResult.value, 'diyScene') : [];
    return {
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

  setPower({ sku, device }, on) {
    return this.control({
      sku,
      device,
      capability: { type: 'devices.capabilities.on_off', instance: 'powerSwitch', value: on ? 1 : 0 },
    });
  }

  setBrightness({ sku, device }, value) {
    return this.control({
      sku,
      device,
      capability: { type: 'devices.capabilities.range', instance: 'brightness', value: clampInteger(value, 1, 100, 'brightness') },
    });
  }

  setColor({ sku, device }, color) {
    return this.control({
      sku,
      device,
      capability: { type: 'devices.capabilities.color_setting', instance: 'colorRgb', value: rgbToInteger(normalizeRgb(color)) },
    });
  }

  setColorTemperature({ sku, device }, kelvin) {
    return this.control({
      sku,
      device,
      capability: { type: 'devices.capabilities.color_setting', instance: 'colorTemperatureK', value: clampInteger(kelvin, 1000, 10000, 'kelvin') },
    });
  }

  setScene({ sku, device }, { value, instance = 'lightScene' }) {
    return this.control({
      sku,
      device,
      capability: {
        type: 'devices.capabilities.dynamic_scene',
        instance: instance === 'diyScene' ? 'diyScene' : 'lightScene',
        value: clampInteger(value, 0, Number.MAX_SAFE_INTEGER, 'scene'),
      },
    });
  }

  setSegmentColor({ sku, device }, { segment, color }) {
    return this.control({
      sku,
      device,
      capability: {
        type: 'devices.capabilities.segment_color_setting',
        instance: 'segmentedColorRgb',
        value: {
          segment: (Array.isArray(segment) ? segment : [segment]).map((entry) => clampInteger(entry, 0, 512, 'segment')),
          rgb: rgbToInteger(normalizeRgb(color)),
        },
      },
    });
  }

  setSegmentBrightness({ sku, device }, { segment, brightness }) {
    return this.control({
      sku,
      device,
      capability: {
        type: 'devices.capabilities.segment_color_setting',
        instance: 'segmentedBrightness',
        value: {
          segment: (Array.isArray(segment) ? segment : [segment]).map((entry) => clampInteger(entry, 0, 512, 'segment')),
          brightness: clampInteger(brightness, 1, 100, 'brightness'),
        },
      },
    });
  }

  setMusicMode({ sku, device }, { mode, sensitivity, autoColor, color }) {
    return this.control({
      sku,
      device,
      capability: {
        type: 'devices.capabilities.music_setting',
        instance: 'musicMode',
        value: {
          musicMode: clampInteger(mode, 0, Number.MAX_SAFE_INTEGER, 'mode'),
          sensitivity: clampInteger(sensitivity, 0, 100, 'sensitivity'),
          autoColor: autoColor ? 1 : 0,
          rgb: rgbToInteger(color ? normalizeRgb(color) : { r: 0, g: 0, b: 0 }),
        },
      },
    });
  }
}
