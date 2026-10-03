#!/bin/sh
# Build the module zip: dist/mihomo-ksu-<version>.zip
set -eu

cd "$(dirname "$0")"
. ./versions.env

CACHE=.cache
DIST=dist
STAGE=$DIST/stage

die() {
  echo "build: $*" >&2
  exit 1
}

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1
}

# fetch URL DEST
fetch() {
  curl -fsSL --retry 3 -o "$2.part" "$1" || die "download failed: $1"
  mv "$2.part" "$2"
}

# fetch_pinned URL DEST SHA256 (reuses a cached copy whose hash matches)
fetch_pinned() {
  if [ -f "$2" ] && [ "$(sha256 "$2")" = "$3" ]; then
    return
  fi
  fetch "$1" "$2"
  if [ "$(sha256 "$2")" != "$3" ]; then
    rm -f "$2"
    die "sha256 mismatch: $1"
  fi
}

# Version from the git tag: vX.Y.Z -> versionCode X*10000 + Y*100 + Z (Y, Z < 100).
version=$(git describe --tags --exact-match 2>/dev/null || echo v0.0.0-dev)
if [ "$version" = v0.0.0-dev ]; then
  version_code=0
else
  echo "$version" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]?)\.(0|[1-9][0-9]?)$' ||
    die "tag $version is not vX.Y.Z with Y, Z < 100"
  v=${version#v}
  x=${v%%.*}
  z=${v##*.}
  y=${v#*.}
  y=${y%.*}
  version_code=$((x * 10000 + y * 100 + z))
fi

mkdir -p "$CACHE/latest"

fetch_pinned "https://registry.npmjs.org/js-yaml/-/js-yaml-$JS_YAML_VERSION.tgz" \
  "$CACHE/js-yaml-$JS_YAML_VERSION.tgz" "$JS_YAML_SHA256"
fetch_pinned "https://registry.npmjs.org/kernelsu/-/kernelsu-$KERNELSU_VERSION.tgz" \
  "$CACHE/kernelsu-$KERNELSU_VERSION.tgz" "$KERNELSU_SHA256"

# Same sources as mihomo's own updaters (docs/decisions.md #10), re-downloaded on every build.
mihomo_version=$(curl -fsSL --retry 3 https://github.com/MetaCubeX/mihomo/releases/latest/download/version.txt) ||
  die "cannot resolve the latest mihomo version"
fetch "https://github.com/MetaCubeX/mihomo/releases/latest/download/mihomo-android-arm64-v8-$mihomo_version.gz" \
  "$CACHE/latest/mihomo.gz"
fetch https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip "$CACHE/latest/metacubexd.zip"
fetch https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat "$CACHE/latest/GeoIP.dat"
fetch https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat "$CACHE/latest/GeoSite.dat"

rm -rf "$STAGE"
mkdir -p "$STAGE/bin" "$STAGE/assets" "$STAGE/webroot/vendor"
cp -R module/. "$STAGE/"
cp -R webui/. "$STAGE/webroot/"
# .js rather than .mjs so the WebView serves them with a JavaScript MIME type.
tar -xzf "$CACHE/js-yaml-$JS_YAML_VERSION.tgz" -O package/dist/browser/js-yaml.esm.min.mjs \
  >"$STAGE/webroot/vendor/js-yaml.js"
tar -xzf "$CACHE/kernelsu-$KERNELSU_VERSION.tgz" -O package/index.js >"$STAGE/webroot/vendor/kernelsu.js"
sed -e "s/^version=.*/version=$version/" -e "s/^versionCode=.*/versionCode=$version_code/" \
  module/module.prop >"$STAGE/module.prop"
gunzip -c "$CACHE/latest/mihomo.gz" >"$STAGE/bin/mihomo"
unzip -q "$CACHE/latest/metacubexd.zip" -d "$STAGE/assets"
mv "$STAGE/assets/metacubexd-gh-pages" "$STAGE/assets/ui"
cp "$CACHE/latest/GeoIP.dat" "$CACHE/latest/GeoSite.dat" "$STAGE/assets/"

zip_name=mihomo-ksu-$version.zip
rm -f "$DIST/$zip_name"
(cd "$STAGE" && zip -qrX "../$zip_name" .)

echo "built $DIST/$zip_name (versionCode $version_code, mihomo $mihomo_version)"
