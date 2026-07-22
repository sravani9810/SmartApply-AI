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
RUNNER="$SCRIPT_DIR/run-hourly.sh"

case "${1:-status}" in
  on)
    # Generate the LaunchAgent from the real paths on THIS machine (the committed
    # deploy/ plist is only a reference — paths there are machine-specific).
    mkdir -p "$(dirname "$LOG")" "$(dirname "$PLIST")"
    cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$RUNNER</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Minute</key><integer>0</integer></dict>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
</dict>
</plist>
PLIST_EOF
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
