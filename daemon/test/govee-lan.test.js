import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { GoveeLanClient } from '../src/govee-lan.js';
import { StateStore } from '../src/state-store.js';

async function listen(socket) {
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve));
  return socket.address().port;
}

test('reads the current device state before sending the opposite power command', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'govee-lan-'));
  const store = new StateStore(path.join(directory, 'state.json'));
  await store.init();

  const device = dgram.createSocket('udp4');
  const controlPort = await listen(device);
  const commands = [];
  device.on('message', (buffer, remote) => {
    const packet = JSON.parse(buffer.toString('utf8'));
    commands.push(packet.msg);
    if (['devStatus', 'status'].includes(packet.msg.cmd)) {
      const status = Buffer.from(JSON.stringify({ msg: { cmd: 'devStatus', data: { onOff: 1 } } }));
      device.send(status, remote.port, remote.address);
    }
  });

  const client = new GoveeLanClient({
    target: { ip: '127.0.0.1', controlPort, listenPort: 0 },
    behavior: {
      fallbackPowerOn: true,
      statusTimeoutMs: 500,
      verificationDelayMs: 10_000,
      retryOnce: false,
    },
    store,
    log() {},
  });

  try {
    await client.start();
    const result = await client.smartToggle();
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.deepEqual(result, { previousPower: 1, nextPower: 0, source: 'device', mode: 'power-toggle' });
    assert.ok(commands.some((command) => command.cmd === 'devStatus'));
    assert.ok(commands.some((command) => command.cmd === 'turn' && command.data.value === 0));
  } finally {
    await client.stop();
    device.close();
    await store.flush();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('applies the configured brightness and color only when turning the device on', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'govee-lan-color-'));
  const store = new StateStore(path.join(directory, 'state.json'));
  await store.init();

  const device = dgram.createSocket('udp4');
  const controlPort = await listen(device);
  const commands = [];
  device.on('message', (buffer, remote) => {
    const packet = JSON.parse(buffer.toString('utf8'));
    commands.push(packet.msg);
    if (['devStatus', 'status'].includes(packet.msg.cmd)) {
      const status = Buffer.from(JSON.stringify({ msg: { cmd: 'devStatus', data: { onOff: 0 } } }));
      device.send(status, remote.port, remote.address);
    }
  });

  const client = new GoveeLanClient({
    target: { ip: '127.0.0.1', controlPort, listenPort: 0 },
    behavior: {
      fallbackPowerOn: true,
      statusTimeoutMs: 500,
      verificationDelayMs: 10_000,
      retryOnce: false,
    },
    store,
    log() {},
  });

  try {
    await client.start();
    const result = await client.smartToggle({
      mode: 'power-color-toggle',
      on: { brightness: 72, color: { r: 12, g: 34, b: 56 } },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.equal(result.nextPower, 1);
    assert.equal(result.mode, 'power-color-toggle');
    assert.ok(commands.some((command) => command.cmd === 'turn' && command.data.value === 1));
    assert.ok(commands.some((command) => command.cmd === 'brightness' && command.data.value === 72));
    assert.ok(commands.some((command) => command.cmd === 'colorwc' && command.data.color.r === 12));
  } finally {
    await client.stop();
    device.close();
    await store.flush();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
