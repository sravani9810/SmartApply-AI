#!/bin/bash
# Hourly runner invoked by the launchd agent (com.smartapply.jobsearch).
# Builds the workspace (so config/board edits take effect) and runs the hub
# ingest, which scrapes the active boards straight into the hub DB (and still
# writes the Excel workbook / Google Sheet as a side effect).
set -uo pipefail

# launchd runs with a minimal PATH; ensure Node/npm are found.
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Derive the repo root from this script's location (portable across machines).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO" || { echo "repo not found: $REPO"; exit 1; }

echo "===== $(date '+%Y-%m-%d %H:%M:%S') hourly run start ====="
npm run build && npm run ingest -w @smartapply/hub
code=$?
echo "===== $(date '+%Y-%m-%d %H:%M:%S') hourly run end (exit $code) ====="
exit $code
