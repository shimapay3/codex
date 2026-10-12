#!/usr/bin/env bash
set -euo pipefail

# ── Config ──────────────────────────────────────────────
VPS_HOST="srv1884623.hstgr.cloud"
VPS_USER="root"
REMOTE_DIR="/root/dev/payproject"

# Read password from the platform-managed env file
VPS_PASS="$(sed -n 's/^VPS_SSH_PASSWORD=//p' /run/base44/app.env 2>/dev/null | tr -d '\r\n"')"
if [ -z "$VPS_PASS" ]; then
  echo "ERROR: VPS_SSH_PASSWORD not found in /run/base44/app.env"
  exit 1
fi

export SSHPASS="$VPS_PASS"
SSH_BASE="sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 $VPS_USER@$VPS_HOST"

echo "==> Syncing code to $VPS_HOST:$REMOTE_DIR ..."

# Pack everything except build artifacts, deps, and runtime data
tar czf - \
  --exclude='./node_modules' \
  --exclude='./web/node_modules' \
  --exclude='./server/node_modules' \
  --exclude='./web/dist' \
  --exclude='./.git' \
  --exclude='./data' \
  --exclude='./deploy-vps.sh' \
  . | $SSH_BASE "mkdir -p $REMOTE_DIR && tar xzf - -C $REMOTE_DIR"

echo "==> Installing server dependencies ..."
$SSH_BASE "cd $REMOTE_DIR/server && npm install --omit=dev 2>&1 | tail -3"

echo "==> Building frontend ..."
$SSH_BASE "cd $REMOTE_DIR/web && npm install 2>&1 | tail -3 && npm run build 2>&1 | tail -5"

echo "==> Fixing permissions for nginx ..."
$SSH_BASE "chmod o+x /root /root/dev /root/dev/payproject /root/dev/payproject/web /root/dev/payproject/web/dist && chmod -R o+r /root/dev/payproject/web/dist && find /root/dev/payproject/web/dist -type d -exec chmod o+x {} \;"

echo "==> Restarting API service ..."
$SSH_BASE "systemctl restart cloudpay-api && sleep 2 && systemctl is-active cloudpay-api"

echo "==> Verifying ..."
$SSH_BASE "curl -s -o /dev/null -w 'nginx: %{http_code}\n' https://localusd.cloud/ ; curl -s -o /dev/null -w 'api:   %{http_code}\n' http://127.0.0.1:8000/health"

echo "==> Deploy complete!"
