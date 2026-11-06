#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
case "${1:-}" in
  '') check=0 ;;
  --check) check=1 ;;
  *) echo "Usage: $0 [--check]" >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || { echo "Usage: $0 [--check]" >&2; exit 2; }
status=0
for file in liquid-glass.js glass-webgl.js components.js; do
  if [ "$check" -eq 1 ]; then
    if ! cmp -s "lib/$file" "skill/liquid-glass-web/assets/$file"; then
      echo "skill asset differs: $file" >&2
      status=1
    fi
  else
    cp "lib/$file" "skill/liquid-glass-web/assets/$file"
  fi
done
[ "$check" -eq 1 ] || echo "skill assets synced from lib/"
exit "$status"
