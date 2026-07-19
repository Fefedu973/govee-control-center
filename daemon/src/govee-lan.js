import dgram from 'node:dgram';

const SCAN_PORT = 4001;
const MULTICAST_ADDRESS = '239.255.255.250';

function decodePacket(buffer) {
  try {
    const packet = JSON.parse(buffer.toString('utf8').trim());
    if (typeof packet?.msg?.cmd !== 'string') return null;
    return { command: packet.msg.cmd, data: packet.msg.data || {} };
  } catch {
    return null;
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class GoveeLanClient {
  constructor({ target, behavior, store, log }) {
    this.target = target;
    this.behavior = behavior;
    this.store = store;
    this.log = log;
    this.socket = null;
    this.pendingStatus = new Set();
    this.discoveredDevices = new Map();
    this.lastPower = store.snapshot().lastPower;
    this.lastStatusAt = store.snapshot().lastStatusAt;
    this.sessionStatusReceived = false;
    this.ready = false;
  }

  async start() {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket.on('message', (buffer, remote) => this.#onMessage(buffer, remote));
    this.socket.on('error', (error) => this.log('error', 'udp_error', { message: error.message }));

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this.socket.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        this.socket.off('error', onError);
        resolve();
      };
      this.socket.once('error', onError);
      this.socket.once('listening', onListening);
      this.socket.bind(this.target.listenPort, '0.0.0.0');
    });

    this.ready = true;
    this.socket.setBroadcast(true);
    this.socket.setMulticastTTL(4);
    const address = this.socket.address();
    this.log('info', 'udp_listening', { port: address.port });
    await this.discover();
  }

  reconfigure({ target, behavior }) {
    if (target.listenPort !== this.target.listenPort) {
      throw new Error('Changing target.listenPort requires a service restart');
    }
    this.target = target;
    this.behavior = behavior;
    this.sessionStatusReceived = false;
  }

  devices() {
    const devices = [...this.discoveredDevices.values()].map((device) => ({
      ...device,
      configured: device.ip === this.target.ip,
    }));
    if (!devices.some((device) => device.ip === this.target.ip)) {
      devices.push({
        id: `configured:${this.target.ip}`,
        ip: this.target.ip,
        sku: 'Configured device',
        name: this.target.ip,
        lastSeen: null,
        configured: true,
      });
    }
    return devices.sort((left, right) => `${left.sku}${left.ip}`.localeCompare(`${right.sku}${right.ip}`));
  }

  async discover() {
    const request = { msg: { cmd: 'scan', data: { account_topic: 'reserve' } } };
    const targets = [MULTICAST_ADDRESS, '255.255.255.255', this.target.ip];
    await Promise.allSettled(targets.map((host) => this.#sendTo(request, SCAN_PORT, host)));
    this.log('info', 'lan_discovery_started');
  }

  async refreshStatus() {
    if (!this.socket) throw new Error('UDP client is not started');

    const response = new Promise((resolve, reject) => {
      const pending = {
        resolve: (power) => {
          clearTimeout(pending.timer);
          this.pendingStatus.delete(pending);
          resolve(power);
        },
        timer: null,
      };
      pending.timer = setTimeout(() => {
        this.pendingStatus.delete(pending);
        reject(new Error(`No Govee status response after ${this.behavior.statusTimeoutMs} ms`));
      }, this.behavior.statusTimeoutMs);
      this.pendingStatus.add(pending);
    });

    await Promise.all([
      this.#send({ msg: { cmd: 'devStatus', data: {} } }),
      this.#send({ msg: { cmd: 'status', data: {} } }),
    ]);
    return response;
  }

  async smartToggle(action = { mode: 'power-toggle', on: {} }) {
    let current = null;
    let source = 'fallback';
    try {
      current = await this.refreshStatus();
      source = 'device';
    } catch (error) {
      this.log('warn', 'status_timeout', { message: error.message });
      if (this.lastPower === 0 || this.lastPower === 1) {
        current = this.lastPower;
        source = 'cache';
      }
    }

    const nextPower = current === null ? Number(this.behavior.fallbackPowerOn) : Number(current !== 1);
    await this.#send({ msg: { cmd: 'turn', data: { value: nextPower } } });

    if (nextPower === 1 && action.mode === 'power-color-toggle') {
      await sleep(100);
      if (action.on?.brightness !== null && action.on?.brightness !== undefined) {
        await this.#send({ msg: { cmd: 'brightness', data: { value: action.on.brightness } } });
      }
      if (action.on?.color) {
        await this.#send({
          msg: {
            cmd: 'colorwc',
            data: {
              color: action.on.color,
              colorTemInKelvin: 0,
            },
          },
        });
      }
    }

    this.#recordPower(nextPower, 'optimistic');
    this.store.update({ lastActionAt: new Date().toISOString() });

    this.#verifyPower(nextPower);
    return { previousPower: current, nextPower, source, mode: action.mode };
  }

  async stop() {
    for (const pending of this.pendingStatus) {
      clearTimeout(pending.timer);
      pending.resolve(this.lastPower);
    }
    this.pendingStatus.clear();
    if (!this.socket) return;
    await new Promise((resolve) => this.socket.close(resolve));
    this.socket = null;
    this.ready = false;
  }

  #onMessage(buffer, remote) {
    const packet = decodePacket(buffer);
    if (!packet) return;

    if (packet.command === 'scan') {
      const ip = packet.data.ip || remote.address;
      const id = packet.data.device || `ip:${ip}`;
      this.discoveredDevices.set(id, {
        id,
        ip,
        sku: packet.data.sku || 'Govee',
        name: packet.data.sku ? `${packet.data.sku} - ${ip}` : ip,
        lastSeen: new Date().toISOString(),
        configured: ip === this.target.ip,
      });
      return;
    }

    if (remote.address !== this.target.ip) return;
    if (!['devStatus', 'status'].includes(packet.command)) return;
    const power = packet.data.onOff;
    if (power !== 0 && power !== 1) return;

    this.sessionStatusReceived = true;
    this.#recordPower(power, 'device');
    for (const pending of [...this.pendingStatus]) pending.resolve(power);
  }

  #recordPower(power, source) {
    this.lastPower = power;
    this.lastStatusAt = new Date().toISOString();
    this.store.update({ lastPower: power, lastStatusAt: this.lastStatusAt });
    this.log('info', 'power_state', { power, source });
  }

  async #send(payload) {
    return this.#sendTo(payload, this.target.controlPort, this.target.ip);
  }

  async #sendTo(payload, port, host) {
    if (!this.socket) throw new Error('UDP client is not started');
    const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
    await new Promise((resolve, reject) => {
      this.socket.send(buffer, port, host, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  #verifyPower(expectedPower) {
    const timer = setTimeout(async () => {
      try {
        const actualPower = await this.refreshStatus();
        if (actualPower === expectedPower || !this.behavior.retryOnce) return;

        this.log('warn', 'power_mismatch_retry', { expectedPower, actualPower });
        await this.#send({ msg: { cmd: 'turn', data: { value: expectedPower } } });
      } catch (error) {
        this.log('warn', 'power_verification_failed', { message: error.message });
      }
    }, this.behavior.verificationDelayMs);
    timer.unref?.();
  }
}

export const testing = { decodePacket };
