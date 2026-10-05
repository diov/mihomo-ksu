SKIPUNZIP=1
# Sourced by the KernelSU/APatch installer. SKIPUNZIP=1 (alone on the first line) makes the
# installer skip its own unzip, which lists every file in the zip; extract quietly instead.
ui_print "- Extracting module files"
unzip -qo "$ZIPFILE" -x 'META-INF/*' -d "$MODPATH"
# The installer's default permissions, which SKIPUNZIP=1 also skips.
set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/bin/mihomo" 0 0 0755
set_perm_recursive "$MODPATH/scripts" 0 0 0755 0755

# $MODDIR is the installed module, which this install replaces at the next boot.
. "$MODPATH/scripts/env.sh"

version=$(grep_prop version "$MODPATH/module.prop")
if [ -f "$MODDIR/module.prop" ]; then
  ui_print "- mihomo-ksu $(grep_prop version "$MODDIR/module.prop") -> $version"
else
  ui_print "- mihomo-ksu $version"
fi
ui_print "- Core: mihomo $("$MODPATH/bin/mihomo" -v | head -n 1 | cut -d' ' -f3)"

if [ -d "$DATA" ]; then
  ui_print "- Data: $DATA (kept)"
else
  ui_print "- Data: $DATA (created)"
fi
mkdir -p "$DATA"
chmod 700 "$DATA"

# Dashboard and geo data update themselves on device; only seed missing copies.
seeded=
if [ -z "$(ls -A "$DATA/ui" 2>/dev/null)" ]; then
  rm -rf "$DATA/ui"
  cp -R "$MODPATH/assets/ui" "$DATA/ui"
  ui_print "  Dashboard: metacubexd installed"
  seeded=1
fi
geo=
for f in GeoIP.dat GeoSite.dat; do
  if [ ! -f "$DATA/$f" ]; then
    cp "$MODPATH/assets/$f" "$DATA/$f"
    geo="${geo:+$geo, }$f"
  fi
done
rm -rf "$MODPATH/assets"
if [ -n "$geo" ]; then
  ui_print "  Geo data: $geo installed"
elif [ -z "$seeded" ]; then
  ui_print "  Dashboard and geo data: kept, updated from the dashboard"
fi

if [ ! -f "$DATA/secret" ]; then
  head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n' >"$DATA/secret"
  chmod 600 "$DATA/secret"
  ui_print "  API secret generated"
fi

base_hash=$(sha256sum "$MODPATH/base.yaml" | cut -d' ' -f1)
if [ ! -f "$DATA/config.yaml" ]; then
  cp "$MODPATH/base.yaml" "$DATA/config.yaml"
  echo "$base_hash" >"$DATA/config.base.sha256"
  ui_print "  Config: created from the template"
elif [ -f "$DATA/override.yaml" ] && [ "$base_hash" != "$(cat "$DATA/config.base.sha256" 2>/dev/null)" ]; then
  # Without an override, service.sh regenerates config.yaml from the new template at boot.
  ui_print "  Template changed: open the WebUI after reboot to apply"
fi

# Unset (null) means the system default, which is automatic mode.
if [ "$(settings get global private_dns_mode)" != off ]; then
  ui_print "! Private DNS is on and can bypass the proxy; turn it off in Settings"
fi
