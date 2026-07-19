import { EventEmitter } from 'node:events';
import { readConfig, updateConfig } from './store.js';
import { clampInteger, httpError, normalizeRgb, nowIso } from './util.js';

const LAN_COMMAND_TYPES = new Set(['power', 'toggle', 'brightness', 'color', 'color-temperature', 'refresh']);
const CLOUD_ONLY_COMMAND_TYPES = new Set(['cloud-scene', 'segment-color', 'segment-brightness', 'music-mode']);

function normalizeKey(value) {
  return String(value || '').trim().toUpperCase();
}

function hasCapability(capabilities, type, instance) {
  return (capabilities || []).some((capability) => (
    capability?.type === type && (!instance || capability.instance === instance)
  ));
}

function createSceneId(name) {
  const slug = String(name || 'scene')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'scene';
  return `${slug}-${Date.now().toString(36)}`;
}

/**
 * DeviceHub is the single entry point for everything that wants to control a
 * light. It merges LAN and Cloud devices into one registry (matched by MAC),
 * routes every command to the best transport, and exposes the unified model
 * used by the HTTP API, the local scenes and the BLE button actions.
 */
export class DeviceHub extends EventEmitter {
  constructor(lan, cloud) {
    super();
    this.lan = lan;
    this.cloud = cloud;
    this.cloudDevices = [];
    this.cloudFetchedAt = null;
    this.cloudRefreshing = false;
    this.cloudLastError = null;

    this.lan.on('devices', () => this.emitDevices());
  }

  // ---------------------------------------------------------------- devices

  allDevices() {
    const map = new Map();

    for (const lanDevice of this.lan.allDevices()) {
      const id = normalizeKey(lanDevice.device || lanDevice.id);
      map.set(id, {
        id,
        name: lanDevice.sku && lanDevice.ip ? `${lanDevice.sku} · ${lanDevice.ip}` : lanDevice.ip || id,
        sku: lanDevice.sku || null,
        transports: {
          lan: {
            id: lanDevice.id,
            ip: lanDevice.ip || null,
            online: Boolean(lanDevice.online),
            manual: Boolean(lanDevice.manual),
            lastSeen: lanDevice.lastSeen || null,
            lastStatusAt: lanDevice.lastStatusAt || null,
          },
          cloud: null,
        },
        capabilities: {
          power: true,
          brightness: true,
          color: true,
          colorTemperature: true,
          cloudScenes: false,
          segments: false,
          music: false,
        },
        state: this.#lanState(lanDevice),
        raw: { lan: lanDevice, cloud: null },
      });
    }

    for (const cloudDevice of this.cloudDevices) {
      const id = normalizeKey(cloudDevice.device);
      if (!id) continue;
      const existing = map.get(id);
      const cloudTransport = {
        sku: cloudDevice.sku,
        device: cloudDevice.device,
        retrievedAt: cloudDevice.retrievedAt || this.cloudFetchedAt,
        statusError: cloudDevice.statusError || null,
      };
      const cloudCapabilities = {
        power: hasCapability(cloudDevice.capabilities, 'devices.capabilities.on_off'),
        brightness: hasCapability(cloudDevice.capabilities, 'devices.capabilities.range', 'brightness'),
        color: hasCapability(cloudDevice.capabilities, 'devices.capabilities.color_setting', 'colorRgb'),
        colorTemperature: hasCapability(cloudDevice.capabilities, 'devices.capabilities.color_setting', 'colorTemperatureK'),
        cloudScenes: hasCapability(cloudDevice.capabilities, 'devices.capabilities.dynamic_scene'),
        segments: hasCapability(cloudDevice.capabilities, 'devices.capabilities.segment_color_setting'),
        music: hasCapability(cloudDevice.capabilities, 'devices.capabilities.music_setting'),
      };

      if (existing) {
        existing.name = cloudDevice.name || existing.name;
        existing.sku = existing.sku && existing.sku !== 'Unknown' ? existing.sku : cloudDevice.sku;
        existing.transports.cloud = cloudTransport;
        existing.capabilities = {
          ...existing.capabilities,
          cloudScenes: cloudCapabilities.cloudScenes,
          segments: cloudCapabilities.segments,
          music: cloudCapabilities.music,
        };
        existing.state = this.#freshestState(existing.raw.lan, cloudDevice);
        existing.raw.cloud = cloudDevice;
      } else {
        map.set(id, {
          id,
          name: cloudDevice.name || cloudDevice.sku || id,
          sku: cloudDevice.sku || null,
          transports: { lan: null, cloud: cloudTransport },
          capabilities: cloudCapabilities,
          state: this.#cloudState(cloudDevice),
          raw: { lan: null, cloud: cloudDevice },
        });
      }
    }

    return [...map.values()].sort((a, b) => `${a.name}${a.id}`.localeCompare(`${b.name}${b.id}`));
  }

  getDevice(id) {
    const key = normalizeKey(decodeURIComponent(String(id || '')));
    const device = this.allDevices().find((entry) => entry.id === key);
    if (!device) throw httpError('Unknown device. Run a LAN scan or refresh the cloud devices first.', 404);
    return device;
  }

  #lanState(lanDevice) {
    const status = lanDevice?.status;
    if (!status) return { on: null, brightness: null, color: null, kelvin: null, source: null, updatedAt: null };
    return {
      on: typeof status.onOff === 'number' ? status.onOff : null,
      brightness: typeof status.brightness === 'number' ? status.brightness : null,
      color: status.color && typeof status.color.r === 'number' ? status.color : null,
      kelvin: typeof status.colorTemInKelvin === 'number' && status.colorTemInKelvin > 0 ? status.colorTemInKelvin : null,
      source: 'lan',
      updatedAt: lanDevice.lastStatusAt || lanDevice.lastCommandAt || null,
    };
  }

  #cloudState(cloudDevice) {
    const status = cloudDevice?.status;
    if (!status) return { on: null, brightness: null, color: null, kelvin: null, source: null, updatedAt: null };
    return {
      on: typeof status.onOff === 'number' ? status.onOff : null,
      brightness: typeof status.brightness === 'number' ? status.brightness : null,
      color: status.color || null,
      kelvin: typeof status.colorTemInKelvin === 'number' && status.colorTemInKelvin > 0 ? status.colorTemInKelvin : null,
      source: 'cloud',
      updatedAt: cloudDevice.retrievedAt || this.cloudFetchedAt,
    };
  }

  #freshestState(lanDevice, cloudDevice) {
    const lanState = this.#lanState(lanDevice);
    const cloudState = this.#cloudState(cloudDevice);
    if (lanState.updatedAt === null) return cloudState.updatedAt === null ? lanState : cloudState;
    if (cloudState.updatedAt === null) return lanState;
    return Date.parse(lanState.updatedAt) >= Date.parse(cloudState.updatedAt) ? lanState : cloudState;
  }

  // ---------------------------------------------------------------- commands

  /**
   * Runs one unified command. `via` can be 'auto' (default), 'lan' or 'cloud'.
   * Types: power {on}, toggle {fallbackOnUnknown?, fresh?}, brightness {value},
   * color {r,g,b}, color-temperature {kelvin}, refresh, and the cloud-only
   * cloud-scene / segment-color / segment-brightness / music-mode.
   */
  async command(deviceId, body = {}) {
    const { type, via = 'auto' } = body;
    if (!LAN_COMMAND_TYPES.has(type) && !CLOUD_ONLY_COMMAND_TYPES.has(type)) {
      throw httpError(`Unknown command type: ${type}`, 400);
    }

    const device = this.getDevice(deviceId);
    const transport = this.#pickTransport(device, type, via);

    if (transport === 'lan') {
      await this.#runLanCommand(device, body);
    } else {
      await this.#runCloudCommand(device, body);
    }

    return { deviceId: device.id, type, transport };
  }

  #pickTransport(device, type, via) {
    const lanReady = Boolean(device.transports.lan?.ip) && LAN_COMMAND_TYPES.has(type);
    const cloudReady = Boolean(device.transports.cloud) && this.cloud.status().configured;

    if (via === 'lan') {
      if (!lanReady) throw httpError('This command cannot go through LAN for this device.', 400);
      return 'lan';
    }
    if (via === 'cloud') {
      if (!cloudReady) throw httpError('This command needs the cloud transport, but it is not available for this device.', 400);
      return 'cloud';
    }
    if (CLOUD_ONLY_COMMAND_TYPES.has(type)) {
      if (!cloudReady) throw httpError('This command only exists on the cloud API. Configure an API key first.', 400);
      return 'cloud';
    }
    if (lanReady) return 'lan';
    if (cloudReady) return 'cloud';
    throw httpError('No transport available for this device.', 400);
  }

  async #runLanCommand(device, body) {
    const lanId = device.transports.lan.id;
    switch (body.type) {
      case 'power':
        if (typeof body.on !== 'boolean') throw httpError('on must be a boolean', 400);
        this.lan.setPower(lanId, body.on);
        return;
      case 'toggle':
        await this.lan.smartToggle(lanId, {
          fallbackOnUnknown: body.fallbackOnUnknown !== false,
          freshRead: body.fresh !== false,
        });
        return;
      case 'brightness':
        this.lan.setBrightness(lanId, body.value);
        return;
      case 'color':
        this.lan.setColor(lanId, body);
        return;
      case 'color-temperature':
        this.lan.setColorTemperature(lanId, body.kelvin);
        return;
      case 'refresh':
        this.lan.queryStatus(lanId);
        return;
      default:
        throw httpError(`Command ${body.type} is not a LAN command`, 400);
    }
  }

  async #runCloudCommand(device, body) {
    const target = { sku: device.transports.cloud.sku, device: device.transports.cloud.device };
    switch (body.type) {
      case 'power': {
        if (typeof body.on !== 'boolean') throw httpError('on must be a boolean', 400);
        await this.cloud.setPower(target, body.on);
        this.#patchCloudState(device.id, { onOff: body.on ? 1 : 0 });
        return;
      }
      case 'toggle': {
        let current = device.state.on;
        if (body.fresh !== false || current === null) {
          try {
            const state = await this.cloud.getState(target);
            current = typeof state.onOff === 'number' ? state.onOff : null;
          } catch { }
        }
        const nextOn = current === null ? body.fallbackOnUnknown !== false : current !== 1;
        await this.cloud.setPower(target, nextOn);
        this.#patchCloudState(device.id, { onOff: nextOn ? 1 : 0 });
        return;
      }
      case 'brightness':
        await this.cloud.setBrightness(target, body.value);
        this.#patchCloudState(device.id, { brightness: clampInteger(body.value, 1, 100, 'brightness') });
        return;
      case 'color':
        await this.cloud.setColor(target, body);
        this.#patchCloudState(device.id, { color: normalizeRgb(body), colorTemInKelvin: null });
        return;
      case 'color-temperature':
        await this.cloud.setColorTemperature(target, body.kelvin);
        this.#patchCloudState(device.id, { colorTemInKelvin: clampInteger(body.kelvin, 1000, 10000, 'kelvin'), color: null });
        return;
      case 'refresh': {
        const state = await this.cloud.getState(target);
        this.#patchCloudState(device.id, state);
        return;
      }
      case 'cloud-scene':
        await this.cloud.setScene(target, body);
        return;
      case 'segment-color':
        await this.cloud.setSegmentColor(target, body);
        return;
      case 'segment-brightness':
        await this.cloud.setSegmentBrightness(target, body);
        return;
      case 'music-mode':
        await this.cloud.setMusicMode(target, body);
        return;
      default:
        throw httpError(`Command ${body.type} is not a cloud command`, 400);
    }
  }

  #patchCloudState(deviceId, patch) {
    const entry = this.cloudDevices.find((device) => normalizeKey(device.device) === deviceId);
    if (!entry) return;
    entry.status = { ...(entry.status || {}), ...patch };
    entry.retrievedAt = nowIso();
    this.emitDevices();
  }

  async cloudScenesFor(deviceId) {
    const device = this.getDevice(deviceId);
    if (!device.transports.cloud) throw httpError('This device has no cloud transport.', 400);
    return this.cloud.getScenes({ sku: device.transports.cloud.sku, device: device.transports.cloud.device });
  }

  // ---------------------------------------------------------------- globals

  async allAction(body = {}) {
    const { type } = body;
    if (!['power', 'brightness', 'color'].includes(type)) {
      throw httpError(`Unknown global action type: ${type}`, 400);
    }

    const results = [];
    for (const device of this.allDevices()) {
      try {
        const result = await this.command(device.id, body);
        results.push({ deviceId: device.id, ok: true, transport: result.transport });
      } catch (error) {
        results.push({ deviceId: device.id, ok: false, error: error.message });
      }
    }
    return results;
  }

  // ---------------------------------------------------------------- scenes

  async listScenes() {
    const config = await readConfig();
    return config.scenes;
  }

  async snapshotScene(name) {
    const cleanName = typeof name === 'string' && name.trim() ? name.trim() : `Scène ${new Date().toLocaleString('fr-FR')}`;
    const devices = this.allDevices()
      .filter((device) => device.state.on !== null)
      .map((device) => ({
        deviceId: device.id,
        name: device.name,
        sku: device.sku,
        on: device.state.on,
        brightness: device.state.brightness,
        color: device.state.color,
        kelvin: device.state.kelvin,
      }));

    if (devices.length === 0) {
      throw httpError('No device with a known state can be saved in a scene yet. Scan or refresh states first.', 400);
    }

    const scene = { id: createSceneId(cleanName), name: cleanName, createdAt: nowIso(), devices };
    const config = await updateConfig((currentConfig) => {
      currentConfig.scenes = [scene, ...currentConfig.scenes.filter((entry) => entry.id !== scene.id)].slice(0, 50);
      return currentConfig;
    });
    this.emit('scenes', config.scenes);
    return { scene, scenes: config.scenes };
  }

  async applyScene(sceneId) {
    const scenes = await this.listScenes();
    const scene = scenes.find((entry) => entry.id === sceneId);
    if (!scene) throw httpError('Unknown scene', 404);

    const results = [];
    for (const entry of scene.devices || []) {
      try {
        // Pre-3.0 scenes used `onOff`/`colorTemInKelvin` field names.
        const on = entry.on ?? entry.onOff;
        const kelvin = entry.kelvin ?? entry.colorTemInKelvin;
        if (typeof on === 'number') {
          await this.command(entry.deviceId, { type: 'power', on: on === 1 });
          if (on === 0) {
            results.push({ deviceId: entry.deviceId, ok: true });
            continue;
          }
        }
        if (typeof entry.brightness === 'number') {
          await this.command(entry.deviceId, { type: 'brightness', value: entry.brightness });
        }
        if (entry.color && typeof entry.color.r === 'number') {
          await this.command(entry.deviceId, { type: 'color', ...entry.color });
        } else if (typeof kelvin === 'number' && kelvin > 0) {
          await this.command(entry.deviceId, { type: 'color-temperature', kelvin });
        }
        results.push({ deviceId: entry.deviceId, ok: true });
      } catch (error) {
        results.push({ deviceId: entry.deviceId, ok: false, error: error.message });
      }
    }
    return { scene, results };
  }

  async deleteScene(sceneId) {
    const config = await updateConfig((currentConfig) => {
      currentConfig.scenes = currentConfig.scenes.filter((scene) => scene.id !== sceneId);
      return currentConfig;
    });
    this.emit('scenes', config.scenes);
    return config.scenes;
  }

  // ---------------------------------------------------------------- cloud

  cloudStatus() {
    return {
      ...this.cloud.status(),
      deviceCount: this.cloudDevices.length,
      fetchedAt: this.cloudFetchedAt,
      refreshing: this.cloudRefreshing,
      lastRefreshError: this.cloudLastError,
    };
  }

  async refreshCloud() {
    if (!this.cloud.status().configured) {
      this.cloudDevices = [];
      this.cloudFetchedAt = null;
      this.emitCloudStatus();
      this.emitDevices();
      return this.cloudStatus();
    }

    this.cloudRefreshing = true;
    this.emitCloudStatus();
    try {
      const retrievedAt = nowIso();
      const devices = await this.cloud.listDevices({ includeState: true });
      this.cloudDevices = devices.map((device) => ({ ...device, retrievedAt }));
      this.cloudFetchedAt = retrievedAt;
      this.cloudLastError = null;
    } catch (error) {
      this.cloudLastError = error.message;
      throw error;
    } finally {
      this.cloudRefreshing = false;
      this.emitCloudStatus();
      this.emitDevices();
    }
    return this.cloudStatus();
  }

  async setCloudApiKey(apiKey) {
    await this.cloud.setApiKey(apiKey);
    if (this.cloud.status().configured) {
      await this.refreshCloud().catch(() => { });
    } else {
      this.cloudDevices = [];
      this.cloudFetchedAt = null;
      this.cloudLastError = null;
      this.emitCloudStatus();
      this.emitDevices();
    }
    return this.cloudStatus();
  }

  // ---------------------------------------------------------------- ble

  /** Executes a configured BLE button action through the unified pipeline. */
  async runBleAction(action) {
    switch (action.mode) {
      case 'turn-on':
        return this.command(action.targetDeviceId, { type: 'power', on: true });
      case 'turn-off':
        return this.command(action.targetDeviceId, { type: 'power', on: false });
      case 'toggle-cached':
        return this.command(action.targetDeviceId, { type: 'toggle', fresh: false, fallbackOnUnknown: action.fallbackOnUnknown });
      default:
        return this.command(action.targetDeviceId, { type: 'toggle', fresh: true, fallbackOnUnknown: action.fallbackOnUnknown });
    }
  }

  // ---------------------------------------------------------------- events

  emitDevices() {
    this.emit('devices', this.allDevices());
  }

  emitCloudStatus() {
    this.emit('cloudStatus', this.cloudStatus());
  }
}
