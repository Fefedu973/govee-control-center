import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_RECENT_EVENTS = 32;

function defaultState() {
  return {
    version: 1,
    lastPower: null,
    lastStatusAt: null,
    lastEventAt: null,
    lastActionAt: null,
    recentEvents: [],
    metrics: {
      buttonEvents: 0,
      duplicates: 0,
      actions: 0,
      failures: 0,
    },
  };
}

function normalizeState(value) {
  const fallback = defaultState();
  const metrics = value?.metrics || {};
  return {
    ...fallback,
    ...value,
    lastPower: value?.lastPower === 0 || value?.lastPower === 1 ? value.lastPower : null,
    recentEvents: Array.isArray(value?.recentEvents)
      ? value.recentEvents
          .filter((entry) => typeof entry?.key === 'string' && Number.isFinite(entry?.seenAt))
          .slice(-MAX_RECENT_EVENTS)
      : [],
    metrics: {
      buttonEvents: Number(metrics.buttonEvents) || 0,
      duplicates: Number(metrics.duplicates) || 0,
      actions: Number(metrics.actions) || 0,
      failures: Number(metrics.failures) || 0,
    },
  };
}

export class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = defaultState();
    this.saveTimer = null;
    this.savePromise = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.state = normalizeState(JSON.parse(await fs.readFile(this.filePath, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`Unable to read state: ${error.message}`);
      await this.flush();
    }
  }

  snapshot() {
    return structuredClone(this.state);
  }

  acceptEvent(key, now, ttlMs) {
    this.state.recentEvents = this.state.recentEvents.filter((entry) => now - entry.seenAt <= ttlMs);
    if (this.state.recentEvents.some((entry) => entry.key === key)) return false;
    this.state.recentEvents.push({ key, seenAt: now });
    this.state.recentEvents = this.state.recentEvents.slice(-MAX_RECENT_EVENTS);
    this.scheduleSave();
    return true;
  }

  update(values) {
    Object.assign(this.state, values);
    this.scheduleSave();
  }

  increment(metric) {
    if (!(metric in this.state.metrics)) throw new Error(`Unknown metric: ${metric}`);
    this.state.metrics[metric] += 1;
    this.scheduleSave();
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush().catch((error) => console.error(`state persistence failed: ${error.message}`));
    }, 1000);
    this.saveTimer.unref?.();
  }

  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    const payload = `${JSON.stringify(this.state, null, 2)}\n`;
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    this.savePromise = this.savePromise.then(async () => {
      await fs.writeFile(tempPath, payload, { mode: 0o600 });
      await fs.rename(tempPath, this.filePath);
      await fs.chmod(this.filePath, 0o600);
    });
    await this.savePromise;
  }
}
