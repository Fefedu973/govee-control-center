# Govee smart-toggle daemon

This is the production replacement for the former 257 MB Govee Control Hub on the Raspberry Pi. It has a responsive loopback-only configuration page, but intentionally contains no public dashboard, scenes, packet history, cloud API, screenshots, or firmware tools.

It performs one job:

1. passively listen for the configured H5122 BLE button;
2. deduplicate repeated advertisements by the H512x event id;
3. query the configured Govee light over the LAN API;
4. send the opposite `turn` state;
5. optionally apply a configured color and brightness when turning on;
6. verify the resulting state once.

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

## Local configuration console

The console is deliberately bound to `127.0.0.1` on the Raspberry Pi. Open an SSH tunnel from your workstation:

```bash
ssh -L 8788:127.0.0.1:8788 pi@192.168.1.37
```

Then open `http://127.0.0.1:8788`. Keep the SSH session open while using the page.

On Windows, the repository includes a helper that creates the tunnel, waits for it to become ready, and opens the page:

```powershell
.\scripts\open-daemon-console.ps1 -SshHost <ssh-host>
```

The helper expects key-based SSH authentication. If the workstation already has an SSH alias for the Pi, pass that alias as `-SshHost`.

The page lets you:

- press and select a detected H5122/H5125/H5126 Bluetooth button;
- choose which physical button index triggers the action;
- discover and select a Govee LAN device;
- use a simple power toggle; or
- turn on with a forced RGB color and optional brightness, then turn off normally.

`Enregistrer et tester` persists the settings and immediately executes one action. Press it a second time to restore the previous power state when testing the simple toggle. Do not expose port 8788 through the router or a public reverse proxy.

## Access away from the home network

The loopback binding is intentional: the console can change the physical button-to-light mapping and execute a test action. For remote access, first reach the Pi through a private network such as a home VPN or Tailscale, then use the same SSH tunnel:

```powershell
.\scripts\open-daemon-console.ps1 -SshHost <pi-vpn-hostname>
```

This keeps the HTTP console private and reuses SSH authentication. Avoid changing `health.host` to `0.0.0.0` unless the Pi is protected by a host firewall and the port is restricted to a trusted private subnet.
