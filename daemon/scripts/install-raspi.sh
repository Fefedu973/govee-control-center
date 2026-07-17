#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---install-only}"
if [[ "${MODE}" != "--install-only" && "${MODE}" != "--activate" ]]; then
  echo "Usage: $0 [--install-only|--activate]" >&2
  exit 2
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="/opt/govee-smart-toggle"
CONFIG_DIR="/etc/govee-smart-toggle"
STATE_DIR="/var/lib/govee-smart-toggle"
SERVICE="govee-smart-toggle.service"
LEGACY_SERVICE="govee-control-center.service"
LEGACY_ROOT="/home/shares/public/Disk2_1To/govee-control-center-hub"
TEMP_CONFIG="$(mktemp)"
trap 'rm -f "${TEMP_CONFIG}"' EXIT

if [[ ! -f "${LEGACY_ROOT}/data/config.json" ]]; then
  echo "Legacy configuration not found at ${LEGACY_ROOT}/data/config.json" >&2
  exit 1
fi

if [[ ! -f "${CONFIG_DIR}/config.json" ]]; then
  node "${SOURCE_DIR}/scripts/migrate-legacy-config.mjs" \
    "${LEGACY_ROOT}/data/config.json" \
    "http://127.0.0.1:8787/api/devices" \
    "${TEMP_CONFIG}"
fi

sudo install -d -m 0755 -o root -g root "${APP_DIR}" "${APP_DIR}/src"
sudo install -d -m 0770 -o root -g pi "${CONFIG_DIR}"
sudo install -d -m 0750 -o pi -g pi "${STATE_DIR}"
sudo install -m 0644 -o root -g root "${SOURCE_DIR}/package.json" "${APP_DIR}/package.json"
sudo install -m 0644 -o root -g root "${SOURCE_DIR}/package-lock.json" "${APP_DIR}/package-lock.json"
sudo find "${APP_DIR}/src" -mindepth 1 -maxdepth 1 -type f -delete
sudo install -m 0644 -o root -g root "${SOURCE_DIR}"/src/*.js "${APP_DIR}/src/"

if [[ ! -f "${CONFIG_DIR}/config.json" ]]; then
  sudo install -m 0600 -o pi -g pi "${TEMP_CONFIG}" "${CONFIG_DIR}/config.json"
fi
sudo chown pi:pi "${CONFIG_DIR}/config.json"
sudo chmod 0600 "${CONFIG_DIR}/config.json"

sudo npm --prefix "${APP_DIR}" ci --omit=dev --no-audit --no-fund
sudo install -m 0644 -o root -g root \
  "${SOURCE_DIR}/systemd/govee-smart-toggle.service" \
  "/etc/systemd/system/${SERVICE}"
sudo systemctl daemon-reload

GOVEE_CONFIG_PATH="${CONFIG_DIR}/config.json" \
  GOVEE_STATE_PATH="${STATE_DIR}/state.json" \
  node "${APP_DIR}/src/index.js" --check-config

if [[ "${MODE}" == "--install-only" ]]; then
  echo "Installed without changing the active service."
  echo "Run $0 --activate for the transactional cutover."
  exit 0
fi

legacy_was_active=false
if systemctl is-active --quiet "${LEGACY_SERVICE}"; then
  legacy_was_active=true
  sudo systemctl stop "${LEGACY_SERVICE}"
fi

rollback() {
  echo "New daemon failed readiness; restoring ${LEGACY_SERVICE}." >&2
  sudo systemctl disable --now "${SERVICE}" >/dev/null 2>&1 || true
  if [[ "${legacy_was_active}" == true ]]; then
    sudo systemctl enable --now "${LEGACY_SERVICE}"
  fi
}

sudo systemctl enable --now "${SERVICE}"
ready=false
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8788/readyz >/tmp/govee-smart-toggle-ready.json; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "${ready}" != true ]]; then
  sudo journalctl -u "${SERVICE}" -n 80 --no-pager >&2 || true
  rollback
  exit 1
fi

sudo systemctl disable "${LEGACY_SERVICE}" >/dev/null 2>&1 || true
sudo systemctl --no-pager --full status "${SERVICE}" | sed -n '1,22p'
cat /tmp/govee-smart-toggle-ready.json
echo
echo "Cutover complete. The legacy unit and files remain available for rollback."
echo "Rollback: sudo systemctl disable --now ${SERVICE} && sudo systemctl enable --now ${LEGACY_SERVICE}"
