#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/Fefedu973/govee-control-center.git"
BRANCH="codex/govee-control-hub"
APP_ROOT="/home/shares/public/Disk2_1To/govee-control-center-hub"
SERVICE_NAME="govee-control-center.service"
PORT="${PORT:-8787}"
BUN_BIN="/home/pi/.bun/bin/bun"

echo "[deploy] host=$(hostname) user=$(whoami)"
echo "[deploy] target=${APP_ROOT} branch=${BRANCH} port=${PORT}"

if ! mountpoint -q /home/shares/public/Disk2_1To; then
  echo "[deploy] ERROR: /home/shares/public/Disk2_1To is not mounted" >&2
  exit 1
fi

if ss -tulpn 2>/dev/null | awk '{print $5}' | grep -Eq "(:|\\])${PORT}$"; then
  if ! systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
    echo "[deploy] ERROR: port ${PORT} is already in use by another service" >&2
    ss -tulpn | grep ":${PORT}" || true
    exit 1
  fi
fi

echo "[deploy] installing system runtime packages"
sudo apt-get update
sudo apt-get install -y ca-certificates curl git

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' >/dev/null 2>&1; then
  echo "[deploy] installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

NODE_BIN="$(readlink -f "$(command -v node)")"
if command -v setcap >/dev/null 2>&1; then
  sudo setcap cap_net_raw,cap_net_admin+eip "${NODE_BIN}" || true
elif [ -x /sbin/setcap ]; then
  sudo /sbin/setcap cap_net_raw,cap_net_admin+eip "${NODE_BIN}" || true
fi

if [ ! -x "${BUN_BIN}" ]; then
  echo "[deploy] installing Bun for pi"
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="/home/pi/.bun/bin:${PATH}"

echo "[deploy] runtime versions"
node --version
"${BUN_BIN}" --version
git --version
if command -v getcap >/dev/null 2>&1; then
  getcap "${NODE_BIN}" || true
elif [ -x /sbin/getcap ]; then
  /sbin/getcap "${NODE_BIN}" || true
fi

parent_dir="$(dirname "${APP_ROOT}")"
mkdir -p "${parent_dir}"

if [ -e "${APP_ROOT}" ] && [ ! -d "${APP_ROOT}/.git" ]; then
  echo "[deploy] ERROR: ${APP_ROOT} exists but is not this app git checkout" >&2
  exit 1
fi

if [ -d "${APP_ROOT}/.git" ]; then
  echo "[deploy] updating existing checkout"
  git -C "${APP_ROOT}" fetch origin "${BRANCH}"
  git -C "${APP_ROOT}" checkout "${BRANCH}"
  git -C "${APP_ROOT}" reset --hard "origin/${BRANCH}"
else
  echo "[deploy] cloning app"
  tmp_dir="${APP_ROOT}.tmp.$$"
  rm -rf "${tmp_dir}"
  git clone --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${tmp_dir}"
  mv "${tmp_dir}" "${APP_ROOT}"
fi

cd "${APP_ROOT}"

if [ ! -f data/config.json ]; then
  cp data/config.example.json data/config.json
fi

echo "[deploy] installing app dependencies"
"${BUN_BIN}" install --frozen-lockfile

echo "[deploy] building frontend"
"${BUN_BIN}" run build

echo "[deploy] installing systemd service"
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

echo "[deploy] waiting for service"
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/settings" >/tmp/govee-control-center-health.json; then
    break
  fi
  sleep 1
done

systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,18p'
echo "[deploy] health"
cat /tmp/govee-control-center-health.json
echo
echo "[deploy] listening"
ss -tulpn 2>/dev/null | grep ":${PORT}" || true
echo "[deploy] disk"
df -h "${APP_ROOT}"
