# Sourced by the KernelSU/APatch installer after the zip is extracted to $MODPATH.
. "$MODPATH/scripts/env.sh"

# The installer resets every file to 0644 before running this script.
set_perm "$MODPATH/bin/mihomo" 0 0 0755
set_perm_recursive "$MODPATH/scripts" 0 0 0755 0755

mkdir -p "$DATA"
chmod 700 "$DATA"

# Dashboard and geo data update themselves on device; only seed missing copies.
if [ -z "$(ls -A "$DATA/ui" 2>/dev/null)" ]; then
  rm -rf "$DATA/ui"
  cp -R "$MODPATH/assets/ui" "$DATA/ui"
fi
for f in GeoIP.dat GeoSite.dat; do
  [ -f "$DATA/$f" ] || cp "$MODPATH/assets/$f" "$DATA/$f"
done
rm -rf "$MODPATH/assets"

if [ ! -f "$DATA/secret" ]; then
  head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n' >"$DATA/secret"
  chmod 600 "$DATA/secret"
fi

if [ ! -f "$DATA/config.yaml" ]; then
  cp "$MODPATH/base.yaml" "$DATA/config.yaml"
  sha256sum "$MODPATH/base.yaml" | cut -d' ' -f1 >"$DATA/config.base.sha256"
fi
