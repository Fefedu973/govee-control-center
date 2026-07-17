import dgram from 'node:dgram';

function parsePacket(buffer) {
  try {
    const packet = JSON.parse(buffer.toString('utf8').trim());
    const command = packet?.msg?.cmd;
    const power = packet?.msg?.data?.onOff;
    if (!['devStatus', 'status'].includes(command)) return null;
    if (power !== 0 && power !== 1) return null;
    return { command, power };
  } catch {
    return null;
  }
}

export class GoveeLanClient {
  constructor({ target, behavior, store, log }) {
    this.target = target;
    this.behavior = behavior;
    this.store = store;
    this.log = log;
    this.socket = null;
    this.pendingStatus = new Set();
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
    const address = this.socket.address();
    this.log('info', 'udp_listening', { port: address.port });
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

  async smartToggle() {
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
    this.#recordPower(nextPower, 'optimistic');
    this.store.update({ lastActionAt: new Date().toISOString() });

    this.#verifyPower(nextPower);
    return { previousPower: current, nextPower, source };
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
    if (remote.address !== this.target.ip) return;
    const status = parsePacket(buffer);
    if (!status) return;

    this.sessionStatusReceived = true;
    this.#recordPower(status.power, 'device');
    for (const pending of [...this.pendingStatus]) pending.resolve(status.power);
  }

  #recordPower(power, source) {
    this.lastPower = power;
    this.lastStatusAt = new Date().toISOString();
    this.store.update({ lastPower: power, lastStatusAt: this.lastStatusAt });
    this.log('info', 'power_state', { power, source });
  }

  async #send(payload) {
    if (!this.socket) throw new Error('UDP client is not started');
    const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
    await new Promise((resolve, reject) => {
      this.socket.send(buffer, this.target.controlPort, this.target.ip, (error) => {
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

export const testing = { parsePacket };
