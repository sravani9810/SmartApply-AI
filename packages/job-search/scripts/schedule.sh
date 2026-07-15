#!/bin/bash
# Turn the hourly job-search scheduler on/off and check its status.
#   scripts/schedule.sh on      install + enable hourly runs
#   scripts/schedule.sh off     disable hourly runs
#   scripts/schedule.sh now     run once immediately
#   scripts/schedule.sh status  show whether it's loaded
set -uo pipefail

LABEL="com.smartapply.jobsearch"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/smartapply/hourly.log"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SRC_PLIST="$REPO/deploy/$LABEL.plist"

case "${1:-status}" in
  on)
    cp "$SRC_PLIST" "$PLIST"
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load -w "$PLIST"
    echo "Scheduler ON — runs at minute 0 of every hour."
    echo "Logs: $LOG"
    ;;
  off)
    launchctl unload -w "$PLIST" 2>/dev/null || true
    echo "Scheduler OFF — no more hourly runs (persists across reboots)."
    ;;
  now)
    launchctl start "$LABEL"
    echo "Triggered one run. Watch it with:  tail -f $LOG"
    ;;
  status)
    if launchctl list | grep -q "$LABEL"; then
      echo "Scheduler: ON (loaded)"
      launchctl list | grep "$LABEL"
    else
      echo "Scheduler: OFF (not loaded)"
    fi
    ;;
  *)
    echo "usage: schedule.sh {on|off|now|status}"
    exit 2
    ;;
esac
