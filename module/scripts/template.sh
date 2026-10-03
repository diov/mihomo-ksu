#!/system/bin/sh
# Usage: template.sh changed | mark | applied
#   changed  exits 0 when base.yaml differs from the one config.yaml was generated from
#   mark     prefixes the module description with a hint to apply the new template
#   applied  records base.yaml's hash and drops the hint (after config.yaml is regenerated)
. "${0%/*}/env.sh"

HINT='[Template updated: open the WebUI to apply] '
PROP=$MODDIR/module.prop

base_hash() {
  sha256sum "$MODDIR/base.yaml" | cut -d' ' -f1
}

case "$1" in
changed)
  [ "$(base_hash)" != "$(cat "$DATA/config.base.sha256" 2>/dev/null)" ]
  ;;
mark)
  grep -qF "description=$HINT" "$PROP" || sed -i "s/^description=/description=$HINT/" "$PROP"
  ;;
applied)
  base_hash >"$DATA/config.base.sha256"
  desc=$(sed -n 's/^description=//p' "$PROP")
  rest=${desc#"$HINT"}
  if [ "$rest" != "$desc" ]; then
    rest=$(printf '%s' "$rest" | sed 's/[&|\\]/\\&/g')
    sed -i "s|^description=.*|description=$rest|" "$PROP"
  fi
  ;;
*)
  echo "usage: $0 changed | mark | applied" >&2
  exit 2
  ;;
esac
