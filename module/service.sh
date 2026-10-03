. "${0%/*}/scripts/env.sh"

until [ "$(getprop sys.boot_completed)" = 1 ]; do
  sleep 2
done

# Merging happens only in the WebUI; at boot just detect a changed base.yaml.
if "$MODDIR/scripts/template.sh" changed; then
  if [ -f "$DATA/override.yaml" ]; then
    "$MODDIR/scripts/template.sh" mark
  else
    cp "$MODDIR/base.yaml" "$DATA/config.yaml"
    "$MODDIR/scripts/template.sh" applied
  fi
fi

"$MODDIR/scripts/ctl.sh" start
inotifyd "$MODDIR/scripts/inotify.sh" "$MODDIR:nd" >/dev/null 2>&1 &
