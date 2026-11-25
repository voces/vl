#!/usr/bin/env bash
# Every unit the I8 self-compile leaves unclaimed, not only the first. Run on a tree after
# `ir-i8-sweep.sh <keep> --apply` (with `emitUnclaimed`): in a copy, `emitUnclaimed` writes
# `unreachable` and carries on; $SEED (one that builds the applied tree, e.g. master's) builds
# that listing compiler, which then builds the same source under `$VL_IR_SHADOW=5`. Claim rows
# only: the census modes that compare against legacy would reach its stubs. Exit 0 when every
# unit is claimed, 1 when one is not (its rows printed), 2 when a build fails.
#   scripts/ir-i8-self-list.sh                 the seed is build/vl-compiler.wasm
set -euo pipefail
VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
SEED=${SEED:-build/vl-compiler.wasm}
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT
grep -q '^function emitUnclaimed' compiler/emit_sections.vl || { echo "self-list: no emitUnclaimed; run ir-i8-sweep.sh --apply and the driver-arm edit first" >&2; exit 2; }
cp -r compiler std "$T/"
awk '/^function emitUnclaimed\(/ { print; print "  fbUnreachable()"; print "  return 0"; skip = 1; next }
  skip && /^}/ { skip = 0 } !skip' compiler/emit_sections.vl > "$T/compiler/emit_sections.vl"
export VL_STD="$T/std"
if ! "$VL" build "$T/compiler/entry.vl" -o "$T/list.wasm" --compiler "$SEED" > "$T/b1.log" 2>&1; then
  echo "self-list: $SEED does not build the listing compiler:"; grep -v '^ \+[0-9]*:\|^ \+at ' "$T/b1.log" | head -5; exit 2
fi
if ! VL_IR_SHADOW=5 "$VL" build "$T/compiler/entry.vl" -o "$T/self.wasm" --compiler "$T/list.wasm" > "$T/b2.log" 2>&1; then
  echo "self-list: the listing compiler does not build the source:"; grep -v '^\[ir\]\|^ \+[0-9]*:\|^ \+at ' "$T/b2.log" | head -5; exit 2
fi
sed -n 's/^\[ir\] [^:]*: //p' "$T/b2.log" | sort -k2 | awk -F'\t' '{ printf "  %7d  %s\n", $1, $2 }'
grep -E "IR claim refused inside" "$T/b2.log" | sed 's/^/  /' || true
n=$(sed -n 's/^\[ir\] [^:]*: //p' "$T/b2.log" | grep -E 'fell back|refused' | awk -F'\t' '{ s += $1 } END { print s + 0 }')
if [ "$n" -gt 0 ]; then echo "self-list: $n units unclaimed"; exit 1; fi
echo "self-list: every unit claimed"
