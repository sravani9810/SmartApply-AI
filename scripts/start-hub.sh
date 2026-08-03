#!/bin/bash
# Boots the SmartApply hub (Next.js on :3100) alongside the resume builder.
# Launched by the "SmartApply Hub.command" shortcut on the Desktop, or run directly.

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || exit 1

# Pin a modern Node: several nvm versions are installed and PATH order is not
# reliable when launched from Finder (v14 wins in some shells and breaks Next).
MIN_MAJOR=20
node_major() { node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/'; }

if [ "$(node_major)" = "" ] || [ "$(node_major)" -lt "$MIN_MAJOR" ]; then
  NVM_NODES="${NVM_DIR:-$HOME/.nvm}/versions/node"
  BEST=""
  if [ -d "$NVM_NODES" ]; then
    BEST="$(ls "$NVM_NODES" | sed 's/^v//' | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
  fi
  if [ -n "$BEST" ]; then
    export PATH="$NVM_NODES/v$BEST/bin:$PATH"
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node ${MIN_MAJOR}+ and try again."
  exit 1
fi

if [ "$(node_major)" -lt "$MIN_MAJOR" ]; then
  echo "Node $(node -v) is too old — this project needs Node ${MIN_MAJOR}+."
  echo "Install it with:  nvm install 22 && nvm alias default 22"
  exit 1
fi

echo "SmartApply-AI  —  $REPO_DIR"
echo "node $(node -v)  npm $(npm -v)"
echo

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run)..."
  npm install || exit 1
  echo
fi

echo "Hub:            http://localhost:3100"
echo "Resume builder: http://localhost:3000"
echo "Press Ctrl-C to stop."
echo "------------------------------------------------------------"

# Open the hub once the port answers, without blocking the log stream.
(
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "http://localhost:3100"; then
      open "http://localhost:3100"
      break
    fi
    sleep 1
  done
) &

exec npm run dev
