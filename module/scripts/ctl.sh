#!/system/bin/sh
# Usage: ctl.sh start | stop | restart | status
. "${0%/*}/env.sh"

BIN=$MODDIR/bin/mihomo
PIDFILE=$DATA/mihomo.pid
LOG=$DATA/log/mihomo.log
# Must match tun.device in base.yaml.
TUN=Meta

# The pid file survives reboots, so also check that the pid still belongs to mihomo.
# A core self-update re-execs in place (same pid, same argv).
running() {
  [ -f "$PIDFILE" ] || return 1
  pid=$(cat "$PIDFILE")
  grep -qsF "$BIN" "/proc/$pid/cmdline"
}

# Let hotspot clients' traffic be forwarded through the tun.
forward_rules() {
  for ipt in iptables ip6tables; do
    for dir in -i -o; do
      if [ "$1" = add ]; then
        $ipt -w -C FORWARD $dir $TUN -j ACCEPT 2>/dev/null || $ipt -w -I FORWARD $dir $TUN -j ACCEPT
      else
        $ipt -w -D FORWARD $dir $TUN -j ACCEPT 2>/dev/null
      fi
    done
  done
}

start() {
  if running; then
    echo "mihomo is already running (pid $pid)"
    return 0
  fi
  mkdir -p "${LOG%/*}"
  # Via the environment rather than -secret: argv is visible to adb shell through ps.
  CLASH_OVERRIDE_SECRET=$(cat "$DATA/secret") nohup "$BIN" -d "$DATA" >"$LOG" 2>&1 &
  echo $! >"$PIDFILE"
  sleep 1
  if ! running; then
    echo "mihomo failed to start, see $LOG:"
    tail -n 5 "$LOG"
    return 1
  fi
  forward_rules add
  echo "mihomo started (pid $pid)"
}

stop() {
  if ! running; then
    rm -f "$PIDFILE"
    echo "mihomo is not running"
    return 0
  fi
  kill "$pid"
  i=0
  while running && [ $i -lt 50 ]; do
    sleep 0.1
    i=$((i + 1))
  done
  running && kill -9 "$pid"
  rm -f "$PIDFILE"
  forward_rules del
  echo "mihomo stopped"
}

status() {
  if running; then
    echo "mihomo is running (pid $pid)"
  else
    echo "mihomo is stopped"
  fi
  # Unset (null) means the system default, which is automatic mode.
  mode=$(settings get global private_dns_mode)
  if [ "$mode" != off ]; then
    echo "warning: Private DNS is '$mode' and can bypass DNS hijacking; turn it off in Settings"
  fi
  running
}

case "$1" in
start) start ;;
stop) stop ;;
restart)
  stop
  start
  ;;
status) status ;;
*)
  echo "usage: $0 start | stop | restart | status" >&2
  exit 2
  ;;
esac
