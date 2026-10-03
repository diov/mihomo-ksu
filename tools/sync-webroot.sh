#!/bin/sh
# Development only: copy webui/ into the installed module's webroot (and, with --module, the
# module scripts) with the installer's owner, mode and SELinux context, skipping a reinstall
# and reboot. Reload the WebUI afterwards. The next real install replaces these files.
set -eu
cd "$(dirname "$0")/.."

M=/data/adb/modules/mihomo-ksu
TMP=/data/local/tmp/mk-sync

adb shell "rm -rf $TMP" && adb push webui $TMP >/dev/null
adb shell "su -c 'cp -R $TMP/. $M/webroot/ && chown -R root:root $M/webroot && \
  find $M/webroot -type f -exec chmod 644 {} + && chcon -R u:object_r:system_file:s0 $M/webroot && rm -rf $TMP'"
echo "synced webui/ -> $M/webroot"

if [ "${1:-}" = --module ]; then
  adb push module/service.sh module/action.sh module/scripts /data/local/tmp/ >/dev/null
  adb shell "su -c 'cp /data/local/tmp/service.sh /data/local/tmp/action.sh $M/ && cp /data/local/tmp/scripts/*.sh $M/scripts/ && \
    chown -R root:root $M/scripts $M/service.sh $M/action.sh && chmod 755 $M/scripts/*.sh && chmod 644 $M/service.sh $M/action.sh && \
    chcon u:object_r:system_file:s0 $M/scripts/*.sh $M/service.sh $M/action.sh && rm -rf /data/local/tmp/service.sh /data/local/tmp/action.sh /data/local/tmp/scripts'"
  echo "synced module scripts -> $M"
fi
