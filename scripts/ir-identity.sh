#!/usr/bin/env bash
# Byte identity of what the IR claims, two ways.
#
#     scripts/ir-identity.sh <seed-a> <seed-b> [--names]
#     scripts/ir-identity.sh --cases <seed>
#
# The first builds every distilled cell (`cells/`, `named/`) and the self-compile under two
# seeds; `--names` adds the name and `vl-src` sections. It prints `identical N, fail under both
# N, differ N, built under one only N`, each cell that differs or built under one seed only, and
# `self-compile identical` or `SELF-COMPILE DIFFERS`.
# `--cases` builds a same-tree compiler with `CLAIMED` empty from <seed> (the shipped compiler
# of this checkout), then builds every tests/cases program not marked `@error`, and every
# scripts/capability-probes program, under both, comparing the wasm and the exit code. It prints
# `cases: identical N, fail under both N, differ N` and each that differs.
# Either exits 1 on any difference. Run from the checkout root; $VL names the host, $JOBS the
# fan-out (default 4). Temp files live under $TMPDIR and are removed on exit.
set -euo pipefail
export VL=${VL:-vl}
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT

# Builds each file listed in $1 under seed $2 into dir $3, keeping its exit code beside it.
build_all() {
  mkdir -p "$3"
  xargs -P "${JOBS:-4}" -I{} bash -c '
    k=$(printf "%s" "$1" | tr "/" "_")
    rc=0
    VL_COMPILER_WASM=$2 timeout 60 "$VL" build "$1" -o "$3/$k.wasm" $FLAGS > /dev/null 2>&1 || rc=$?
    echo "$rc" > "$3/$k.rc"
    [ "$rc" -eq 0 ] || rm -f "$3/$k.wasm"
  ' _ {} "$2" "$3" < "$1"
}

# Compares the builds of the files listed in $1 under dirs $2 and $3; prints each that differs.
compare_all() {
  same=0; both=0; diff=0
  while read -r f; do
    k=$(printf "%s" "$f" | tr "/" "_")
    ra=$(cat "$2/$k.rc"); rb=$(cat "$3/$k.rc")
    if [ "$ra" != "$rb" ]; then diff=$((diff + 1)); echo "DIFF $f (exit $ra vs $rb)"
    elif [ "$ra" != 0 ]; then both=$((both + 1))
    elif cmp -s "$2/$k.wasm" "$3/$k.wasm"; then same=$((same + 1))
    else diff=$((diff + 1)); echo "DIFF $f"; fi
  done < "$1"
}

if [ "${1:-}" = "--cases" ]; then
  SEED=${2:?usage: scripts/ir-identity.sh --cases <seed>}
  export FLAGS=""
  cp -r compiler "$T/c0"
  awk '
    /^const CLAIMED: IrFamily\[\] = \[$/ { print "const CLAIMED: IrFamily[] = []"; skip = 1; hit = 1; next }
    skip && /^\]$/ { skip = 0; next }
    !skip { print }
    END { if (!hit) { print "ir-identity: CLAIMED not found" > "/dev/stderr"; exit 1 } }
  ' compiler/ir_build.vl > "$T/c0/ir_build.vl"
  "$VL" build "$T/c0/entry.vl" -o "$T/claimless.wasm" --compiler "$SEED" > /dev/null
  { grep -rL '^// @error' --include='*.vl' tests/cases; ls scripts/capability-probes/*.vl; } \
    | sort > "$T/list"
  build_all "$T/list" "$SEED" "$T/a"
  build_all "$T/list" "$T/claimless.wasm" "$T/b"
  compare_all "$T/list" "$T/a" "$T/b"
  echo "cases: identical $same, fail under both $both, differ $diff"
  [ "$diff" -eq 0 ]
  exit
fi

A=${1:?usage: scripts/ir-identity.sh <seed-a> <seed-b> [--names] | --cases <seed>}
B=${2:?usage: scripts/ir-identity.sh <seed-a> <seed-b> [--names] | --cases <seed>}
export FLAGS=${3:-}
D=scripts/silent-sweep/distilled
ls "$D"/cells/*.vl "$D"/named/*.vl > "$T/list"
build_all "$T/list" "$A" "$T/a"
build_all "$T/list" "$B" "$T/b"
compare_all "$T/list" "$T/a" "$T/b"
only=0
echo "identical $same, fail under both $both, differ $diff, built under one only $only"
"$VL" build compiler/entry.vl -o "$T/sa.wasm" --compiler "$A" $FLAGS > /dev/null
"$VL" build compiler/entry.vl -o "$T/sb.wasm" --compiler "$B" $FLAGS > /dev/null
self=0
if cmp -s "$T/sa.wasm" "$T/sb.wasm"; then echo "self-compile identical"; else echo "SELF-COMPILE DIFFERS"; self=1; fi
[ "$diff" -eq 0 ] && [ "$self" -eq 0 ]
