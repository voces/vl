#!/usr/bin/env bash
# Byte identity of what the IR claims, two ways.
#
#     scripts/ir-identity.sh <seed-a> <seed-b> [--names]
#     scripts/ir-identity.sh --cases <seed>
#     scripts/ir-identity.sh --compare | --compare-errors <list> <dir-a> <dir-b>
#
# The first builds every distilled cell (`cells/`, `named/`) and the self-compile under two
# seeds; `--names` adds the name and `vl-src` sections. It prints `identical N, fail under both
# N, differ N, built under one only N`, each cell that differs or built under one seed only, and
# `self-compile identical` or `SELF-COMPILE DIFFERS`.
# `--cases` builds a same-tree compiler with `CLAIMED` empty from <seed> (the shipped compiler
# of this checkout), then builds every tests/cases program not marked `@error`, and every
# scripts/capability-probes program, under both, comparing the wasm and the exit code, and for a
# program that fails under both, its first diagnostic line: a claim that turns a legacy refusal
# into a build, or into another refusal, reds. It prints `cases: identical N, fail under both N,
# differ N` and each that differs. It then builds every filed inventory witness whose outcome is
# an emit reject (`scripts/inventory/witnesses.vl`) under both, comparing the exit code and the
# first diagnostic line, and prints `witnesses: same N, differ N`.
# `--compare` and `--compare-errors` are those two comparisons alone, over builds `build_all`
# left in two dirs (each file's `.rc`, `.err` and, built, `.wasm`).
# Either exits 1 on any difference. Run from the checkout root; $VL names the host, $JOBS the
# fan-out (default 4); $VL defaults to the checkout's host. Temp files live under $TMPDIR and are removed on exit.
set -euo pipefail
export VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT

# The first diagnostic line (`path:line:col: message`) of build log $1, else its first line.
first_error() {
  grep -m1 -E '^[^ ]+:[0-9]+:[0-9]+: ' "$1" || head -n1 "$1"
}
export -f first_error

# Builds each file listed in $1 under seed $2 into dir $3, keeping its exit code beside it.
build_all() {
  mkdir -p "$3"
  xargs -P "${JOBS:-4}" -I{} bash -c '
    k=$(printf "%s" "$1" | tr "/" "_")
    rc=0
    VL_COMPILER_WASM=$2 timeout 60 "$VL" build "$1" -o "$3/$k.wasm" $FLAGS > /dev/null 2> "$3/$k.log" || rc=$?
    echo "$rc" > "$3/$k.rc"
    if [ "$rc" -eq 0 ]; then : > "$3/$k.err"; else first_error "$3/$k.log" > "$3/$k.err"; fi
    rm -f "$3/$k.log"
    [ "$rc" -eq 0 ] || rm -f "$3/$k.wasm"
  ' _ {} "$2" "$3" < "$1"
}

# Compares the builds of the files listed in $1 under dirs $2 and $3; prints each that differs.
# With $ERRCMP=1, a file that fails under both differs when its first diagnostic line does.
compare_all() {
  same=0; both=0; diff=0
  while read -r f; do
    k=$(printf "%s" "$f" | tr "/" "_")
    ra=$(cat "$2/$k.rc"); rb=$(cat "$3/$k.rc")
    if [ "$ra" != "$rb" ]; then diff=$((diff + 1)); echo "DIFF $f (exit $ra vs $rb)"
    elif [ "$ra" != 0 ] && [ "${ERRCMP:-0}" = 1 ] && ! cmp -s "$2/$k.err" "$3/$k.err"; then
      diff=$((diff + 1)); echo "DIFF $f (first error: $(cat "$2/$k.err") vs $(cat "$3/$k.err"))"
    elif [ "$ra" != 0 ]; then both=$((both + 1))
    elif cmp -s "$2/$k.wasm" "$3/$k.wasm"; then same=$((same + 1))
    else diff=$((diff + 1)); echo "DIFF $f"; fi
  done < "$1"
}

# Compares the refusals of the files listed in $1 under dirs $2 and $3: the exit code and the
# first diagnostic line, or the wasm when both build; prints each that differs.
compare_errors() {
  esame=0; ediff=0
  while read -r f; do
    k=$(printf "%s" "$f" | tr "/" "_")
    ra=$(cat "$2/$k.rc"); rb=$(cat "$3/$k.rc")
    if [ "$ra" != "$rb" ]; then ediff=$((ediff + 1)); echo "DIFF $f (exit $ra vs $rb)"
    elif [ "$ra" = 0 ] && ! cmp -s "$2/$k.wasm" "$3/$k.wasm"; then ediff=$((ediff + 1)); echo "DIFF $f"
    elif ! cmp -s "$2/$k.err" "$3/$k.err"; then
      ediff=$((ediff + 1)); echo "DIFF $f (first error: $(cat "$2/$k.err") vs $(cat "$3/$k.err"))"
    else esame=$((esame + 1)); fi
  done < "$1"
}

if [ "${1:-}" = "--compare" ]; then
  ERRCMP=1 compare_all "${2:?usage: --compare <list> <dir-a> <dir-b>}" "${3:?}" "${4:?}"
  echo "cases: identical $same, fail under both $both, differ $diff"
  [ "$diff" -eq 0 ]
  exit
fi

if [ "${1:-}" = "--compare-errors" ]; then
  compare_errors "${2:?usage: --compare-errors <list> <dir-a> <dir-b>}" "${3:?}" "${4:?}"
  echo "errors: same $esame, differ $ediff"
  [ "$ediff" -eq 0 ]
  exit
fi

if [ "${1:-}" = "--cases" ]; then
  SEED=${2:?usage: scripts/ir-identity.sh --cases <seed>}
  export FLAGS="" ERRCMP=1
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
  "$VL" run scripts/inventory/witnesses.vl --compiler "$SEED" -- --outcome emit_reject --out "$T/w" > "$T/errs"
  # A witness of the test-only refusal hook refuses only under the flag `check-filed-witnesses` passes.
  FLAGS=--test-emit-refusal build_all "$T/errs" "$SEED" "$T/ea"
  FLAGS=--test-emit-refusal build_all "$T/errs" "$T/claimless.wasm" "$T/eb"
  compare_errors "$T/errs" "$T/ea" "$T/eb"
  echo "witnesses: same $esame, differ $ediff"
  [ "$diff" -eq 0 ] && [ "$ediff" -eq 0 ]
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
