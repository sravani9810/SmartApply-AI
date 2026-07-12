#!/bin/bash
# Hourly runner invoked by the launchd agent (com.smartapply.jobsearch).
# Builds the pipeline (so config edits take effect) and runs the job search,
# which writes to the Excel workbook and — if configured — the Google Sheet.
set -uo pipefail

# launchd runs with a minimal PATH; ensure Node/npm are found.
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

REPO="/Users/sravani/SmartApply-AI"
cd "$REPO" || { echo "repo not found: $REPO"; exit 1; }
mkdir -p logs

echo "===== $(date '+%Y-%m-%d %H:%M:%S') hourly run start ====="
npm run build && node packages/job-search/dist/index.js
code=$?
echo "===== $(date '+%Y-%m-%d %H:%M:%S') hourly run end (exit $code) ====="
exit $code
