#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/home/shares/public/Disk2_1To/govee-control-center-hub"
PORT="${PORT:-8787}"
SERVICE_NAME="govee-control-center.service"

if [ ! -f "${APP_ROOT}/server.js" ]; then
  echo "Missing app at ${APP_ROOT}" >&2
  exit 1
fi

if ss -tulpn 2>/dev/null | awk '{print $5}' | grep -Eq "(:|\\])${PORT}$"; then
  if ! systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
    echo "Port ${PORT} is already used by another service" >&2
    ss -tulpn | grep ":${PORT}" || true
    exit 1
  fi
fi

sudo tee "/etc/systemd/system/${SERVICE_NAME}" >/dev/null <<EOF
[Unit]
Description=Govee Control Center
Wants=network-online.target
After=network-online.target bluetooth.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=${APP_ROOT}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
ExecStart=/usr/bin/node ${APP_ROOT}/server.js
Restart=always
RestartSec=5
KillSignal=SIGINT

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/settings" >/tmp/govee-control-center-health.json; then
    break
  fi
  sleep 1
done

systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,24p'
echo "--- health"
cat /tmp/govee-control-center-health.json
echo
echo "--- listening"
ss -tulpn 2>/dev/null | grep ":${PORT}" || true
