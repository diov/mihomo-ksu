. "${0%/*}/scripts/env.sh"

# The WebUI strips this prefix again after applying the new template.
TEMPLATE_HINT='[Template updated: open the WebUI to apply] '

until [ "$(getprop sys.boot_completed)" = 1 ]; do
  sleep 2
done

# Merging happens only in the WebUI; at boot just detect a changed base.yaml.
base_hash=$(sha256sum "$MODDIR/base.yaml" | cut -d' ' -f1)
if [ "$base_hash" != "$(cat "$DATA/config.base.sha256" 2>/dev/null)" ]; then
  if [ -f "$DATA/override.yaml" ]; then
    grep -qF "description=$TEMPLATE_HINT" "$MODDIR/module.prop" ||
      sed -i "s/^description=/description=$TEMPLATE_HINT/" "$MODDIR/module.prop"
  else
    cp "$MODDIR/base.yaml" "$DATA/config.yaml"
    echo "$base_hash" >"$DATA/config.base.sha256"
  fi
fi

"$MODDIR/scripts/ctl.sh" start
inotifyd "$MODDIR/scripts/inotify.sh" "$MODDIR:nd" >/dev/null 2>&1 &
