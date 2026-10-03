#!/system/bin/sh
# inotifyd handler for the module directory: $1 event, $2 directory, $3 file name.
# Disabling the module in the manager only creates a `disable` marker, so act on it now.
[ "$3" = disable ] || exit 0
case "$1" in
n) exec "${0%/*}/ctl.sh" stop ;;
d) exec "${0%/*}/ctl.sh" start ;;
esac
