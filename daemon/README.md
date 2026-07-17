# Govee smart-toggle daemon

This is the production replacement for the former 257 MB Govee Control Hub on the Raspberry Pi. It intentionally contains no browser UI, discovery dashboard, scenes, packet history, cloud API, screenshots, or firmware tools.

It performs one job:

1. passively listen for the configured H5122 BLE button;
2. deduplicate repeated advertisements by the H512x event id;
3. query the configured Govee light over the LAN API;
4. send the opposite `turn` state;
5. verify the resulting state once.

The daemon stores only a bounded list of 32 event ids, the last known power state, timestamps, and four counters. Its HTTP endpoint binds to loopback only.

## Local validation

```bash
cd daemon
npm install
npm run check
```

## Raspberry Pi installation

The installer migrates the one active H5122 mapping from the running legacy service. The first command does not alter the active service:

```bash
cd /path/to/govee-control-center/daemon
./scripts/install-raspi.sh --install-only
./scripts/install-raspi.sh --activate
```

Activation is transactional. It stops `govee-control-center.service`, starts the new daemon, and waits for both BLE scanning and a real LAN status response. On failure, it restores the legacy service automatically.

## Operations

```bash
systemctl status govee-smart-toggle.service
journalctl -u govee-smart-toggle.service -f
curl http://127.0.0.1:8788/healthz
curl http://127.0.0.1:8788/readyz
```

Manual rollback:

```bash
sudo systemctl disable --now govee-smart-toggle.service
sudo systemctl enable --now govee-control-center.service
```

Configuration lives in `/etc/govee-smart-toggle/config.json`; minimal runtime state lives in `/var/lib/govee-smart-toggle/state.json`.
