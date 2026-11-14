#!/usr/bin/env bash
# Leave only <seed>'s compiled forms in the seed cache (`vl seed --cache-dir`), so a CI cache
# of that directory saves the proven seed's entries, not every rung's and older seed's.
#
#   scripts/seed-cache-trim.sh [<seed>]     (default build/vl-compiler.wasm)
set -euo pipefail
cd "$(dirname "$0")/.."
VL="${VL:-scripts/vl-host/target/release/vl}"
SEED="${1:-build/vl-compiler.wasm}"
dir="$("$VL" seed --cache-dir)"
keep="$("$VL" seed --cache-files --compiler "$SEED")"
for f in "$dir"/*.cwasm; do
  [ -e "$f" ] || continue
  if ! printf '%s\n' "$keep" | grep -qxF "$f"; then rm -f "$f" && echo "trimmed $(basename "$f")"; fi
done
echo "seed cache $dir: $(printf '%s\n' "$keep" | grep -c . || true) entr(ies) of $SEED kept"
