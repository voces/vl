#!/usr/bin/env bash
# Byte identity of two compiler seeds over the distilled corpus and the self-compile: every cell
# in `cells/` and `named/` is built under both, and the self-compile once under each.
#
#     scripts/ir-identity.sh <seed-a> <seed-b> [--names]
#
# `--names` builds with the name and `vl-src` sections, so debug info is compared too. It prints
# the corpus line `identical N, fail under both N, differ N, built under one only N`, each cell
# that differs or built under one seed only, and `self-compile identical` or `SELF-COMPILE
# DIFFERS`. Exit 1 on any differ, one-only or self-compile difference. Run from the checkout root;
# $VL names the host, $JOBS the fan-out (default 4).
set -euo pipefail
A=${1:?usage: scripts/ir-identity.sh <seed-a> <seed-b> [--names]}
B=${2:?usage: scripts/ir-identity.sh <seed-a> <seed-b> [--names]}
FLAGS=${3:-}
export VL=${VL:-vl} FLAGS
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT
D=scripts/silent-sweep/distilled
ls "$D"/cells/*.vl "$D"/named/*.vl > "$T/list"
mkdir -p "$T/a" "$T/b"
one() { # seed outdir cell
  local n d
  n=$(basename "$3" .vl); d=$(basename "$(dirname "$3")")
  VL_COMPILER_WASM=$1 timeout 60 "$VL" build "$3" -o "$2/$d-$n.wasm" $FLAGS > /dev/null 2>&1 \
    || rm -f "$2/$d-$n.wasm"
}
export -f one
xargs -P "${JOBS:-4}" -I{} bash -c "one $A $T/a {}" < "$T/list"
xargs -P "${JOBS:-4}" -I{} bash -c "one $B $T/b {}" < "$T/list"
same=0; both=0; diff=0; only=0
while read -r f; do
  n=$(basename "$f" .vl); d=$(basename "$(dirname "$f")"); a=$T/a/$d-$n.wasm; b=$T/b/$d-$n.wasm
  if [ -f "$a" ] && [ -f "$b" ]; then
    if cmp -s "$a" "$b"; then same=$((same + 1)); else diff=$((diff + 1)); echo "DIFF $d/$n"; fi
  elif [ ! -f "$a" ] && [ ! -f "$b" ]; then both=$((both + 1))
  else only=$((only + 1)); echo "ONE $d/$n"; fi
done < "$T/list"
echo "identical $same, fail under both $both, differ $diff, built under one only $only"
"$VL" build compiler/entry.vl -o "$T/sa.wasm" --compiler "$A" $FLAGS > /dev/null
"$VL" build compiler/entry.vl -o "$T/sb.wasm" --compiler "$B" $FLAGS > /dev/null
self=0
if cmp -s "$T/sa.wasm" "$T/sb.wasm"; then echo "self-compile identical"; else echo "SELF-COMPILE DIFFERS"; self=1; fi
[ "$diff" -eq 0 ] && [ "$only" -eq 0 ] && [ "$self" -eq 0 ]
