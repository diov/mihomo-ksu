#!/system/bin/sh
# Rotates the core log daily, keeping today's and the previous day's. mihomo keeps the log
# open, so copy and truncate it rather than moving it (ctl.sh opens it for appending).
. "${0%/*}/env.sh"

DAY=$DATA/log/day

# Compares dates rather than waiting for midnight: sleep may overrun while the device sleeps.
while :; do
  today=$(date +%F)
  if [ "$today" != "$(cat "$DAY" 2>/dev/null)" ]; then
    if [ -f "$LOG" ]; then
      cp "$LOG" "$LOG.1"
      : >"$LOG"
    fi
    echo "$today" >"$DAY"
  fi
  sleep 600
done
