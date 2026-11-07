#!/bin/bash
# The identity shadow's sweep (architecture-target-2026-10.md §3.4, option (A)).
#
#   scripts/id-shadow/run.sh --identity SEED_A SEED_B LIST OUT
#   scripts/id-shadow/run.sh --shadow SEED LIST OUT
#
# --identity builds every file in LIST with each seed, `$VL_ID_SHADOW` unset, and writes one
# line per file to OUT: `same`, `DIFF` or `rcdiff`, then the path. Two failed builds with the
# same stderr are `same`.
# --shadow builds every file with SEED at `$VL_ID_SHADOW=1` and `=2`, and writes OUT.rows (the
# mode-1 rows, `<path> <row>`), OUT.insts (`<path> <mode-1 insts> <mode-2 insts>`) and
# OUT.bytes (`same`/`DIFF`/`rcdiff` of mode 2 against mode 1, then the path).
# Run from the checkout root; JOBS (default 4) builds run at once.
set -euo pipefail

VL="${VL:-$PWD/scripts/vl-host/target/release/vl}"
JOBS="${JOBS:-4}"
T="$(mktemp -d "${TMPDIR:-/tmp}/id-shadow.XXXXXX")"
trap 'rm -rf "${T:?}"' EXIT
export VL T

bld() { # seed mode file out -> writes out.wasm, out.err, out.rc
  local rc=0
  if [ "$2" = 0 ]; then
    VL_STD="$PWD/std" timeout 120 "$VL" build "$3" --compiler "$1" -o "$4.wasm" \
      > /dev/null 2> "$4.err" < /dev/null || rc=$?
  else
    VL_ID_SHADOW="$2" VL_STD="$PWD/std" timeout 120 "$VL" build "$3" --compiler "$1" \
      -o "$4.wasm" > /dev/null 2> "$4.err" < /dev/null || rc=$?
  fi
  echo "$rc" > "$4.rc"
}
cmp3() { # a b -> same / DIFF / rcdiff
  if [ "$(cat "$1.rc")" != "$(cat "$2.rc")" ]; then echo rcdiff; return; fi
  if [ "$(cat "$1.rc")" != 0 ]; then
    if diff -q <(grep -v '^\[id-shadow\]' "$1.err" | sed "s|$T/[^ ]*||g") \
      <(grep -v '^\[id-shadow\]' "$2.err" | sed "s|$T/[^ ]*||g") > /dev/null; then
      echo same
    else
      echo DIFF
    fi
    return
  fi
  if cmp -s "$1.wasm" "$2.wasm"; then echo same; else echo DIFF; fi
}
export -f bld cmp3

case "$1" in
  --identity)
    A="$2" B="$3" LIST="$4" OUT="$5"
    export A B
    one() {
      local o
      o="$(mktemp -d "$T/o.XXXXXX")"
      bld "$A" 0 "$1" "$o/a"
      bld "$B" 0 "$1" "$o/b"
      echo "$(cmp3 "$o/a" "$o/b") $1"
      rm -rf "$o"
    }
    export -f one
    xargs -a "$LIST" -P "$JOBS" -I{} bash -c 'one "$1"' _ {} > "$OUT"
    awk '{n[$1]++} END {for (k in n) print k, n[k]}' "$OUT"
    ;;
  --shadow)
    S="$2" LIST="$3" OUT="$4"
    export S
    one() {
      local o
      o="$(mktemp -d "$T/o.XXXXXX")"
      bld "$S" 1 "$1" "$o/m1"
      bld "$S" 2 "$1" "$o/m2"
      grep -F '[id-shadow]' "$o/m1.err" | sed "s|^\[id-shadow\] [^:]*: |$1 |" > "$o/rows" || true
      local i1 i2
      i1="$(grep -F '[id-shadow]' "$o/m1.err" | grep -F ': insts ' | awk '{s += $NF} END {print s + 0}')"
      i2="$(grep -F '[id-shadow]' "$o/m2.err" | grep -F ': insts ' | awk '{s += $NF} END {print s + 0}')"
      {
        flock 9
        cat "$o/rows" >> "$T/rows"
        echo "$1 $i1 $i2" >> "$T/insts"
        echo "$(cmp3 "$o/m1" "$o/m2") $1" >> "$T/bytes"
      } 9> "$T/lock"
      rm -rf "$o"
    }
    export -f one
    : > "$T/rows"; : > "$T/insts"; : > "$T/bytes"
    xargs -a "$LIST" -P "$JOBS" -I{} bash -c 'one "$1"' _ {}
    cp "$T/rows" "$OUT.rows"; cp "$T/insts" "$OUT.insts"; cp "$T/bytes" "$OUT.bytes"
    awk '{n[$1]++} END {for (k in n) print "bytes", k, n[k]}' "$OUT.bytes"
    awk '$2 != $3 {print "insts-moved", $0}' "$OUT.insts" | head -20
    ;;
  *)
    echo "usage: run.sh --identity SEED_A SEED_B LIST OUT | --shadow SEED LIST OUT" >&2
    exit 2
    ;;
esac
