import { manufacturerCandidates, parseH512xAdvertisement } from './h512x.js';

export class BleScanner {
  constructor({ sensor, onEvent, onStatus, log }) {
    this.sensor = sensor;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.log = log;
    this.noble = null;
    this.scanning = false;
    this.state = 'loading';
    this.discoveredDevices = new Map();
  }

  async start() {
    const imported = await import('@stoprocent/noble');
    this.noble = imported.default || imported;
    this.state = this.noble.state || 'unknown';

    this.noble.on('stateChange', (state) => {
      this.state = state;
      this.log('info', 'ble_state', { state });
      if (state === 'poweredOn') this.#startScanning();
      else this.#stopScanning();
      this.#emitStatus();
    });
    this.noble.on('discover', (peripheral) => this.#onDiscover(peripheral));
    this.noble.on('warning', (message) => this.log('warn', 'ble_warning', { message: String(message) }));

    if (this.state === 'poweredOn') this.#startScanning();
    this.#emitStatus();
  }

  stop() {
    this.#stopScanning();
    this.noble?.removeAllListeners('discover');
    this.noble?.removeAllListeners('stateChange');
  }

  reconfigure(sensor) {
    this.sensor = sensor;
  }

  devices() {
    const devices = [...this.discoveredDevices.values()].map((device) => ({
      ...device,
      configured: device.address === this.sensor.address,
    }));
    if (!devices.some((device) => device.address === this.sensor.address)) {
      devices.push({
        address: this.sensor.address,
        name: this.sensor.address,
        model: 'Configured button',
        buttonCount: Math.max(1, this.sensor.button + 1),
        battery: null,
        rssi: null,
        lastSeen: null,
        configured: true,
      });
    }
    return devices.sort((left, right) => `${left.model}${left.address}`.localeCompare(`${right.model}${right.address}`));
  }

  #startScanning() {
    if (!this.noble || this.scanning || this.noble.state !== 'poweredOn') return;
    try {
      this.noble.startScanning([], true);
      this.scanning = true;
      this.log('info', 'ble_scan_started');
    } catch (error) {
      this.log('error', 'ble_scan_failed', { message: error.message });
    }
    this.#emitStatus();
  }

  #stopScanning() {
    if (!this.noble || !this.scanning) return;
    try {
      this.noble.stopScanning();
    } catch {
      // Adapter shutdown can race with Noble's own stop operation.
    }
    this.scanning = false;
    this.#emitStatus();
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

      this.discoveredDevices.set(address, {
        ...parsed.sensor,
        lastSeen: new Date().toISOString(),
        configured: address === this.sensor.address,
      });

      if (address !== this.sensor.address || parsed.event.button !== this.sensor.button) return;
      this.onEvent(parsed);
      return;
    }
  }

  #emitStatus() {
    this.onStatus({ state: this.state, scanning: this.scanning });
  }
}
