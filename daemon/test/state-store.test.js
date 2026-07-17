import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { StateStore } from '../src/state-store.js';

test('deduplicates event ids across process restarts', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'govee-state-'));
  const statePath = path.join(directory, 'state.json');

  try {
    const first = new StateStore(statePath);
    await first.init();
    assert.equal(first.acceptEvent('0:event-a', 1000, 5000), true);
    assert.equal(first.acceptEvent('0:event-a', 1200, 5000), false);
    await first.flush();

    const restarted = new StateStore(statePath);
    await restarted.init();
    assert.equal(restarted.acceptEvent('0:event-a', 1500, 5000), false);
    assert.equal(restarted.acceptEvent('0:event-a', 7001, 5000), true);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
