#!/usr/bin/env bash
# Byte identity of what the IR claims, two ways.
#
#     scripts/ir-identity.sh <seed-a> <seed-b> [--names]
#     scripts/ir-identity.sh --cases <seed>
#     scripts/ir-identity.sh --claimless <seed> [list]
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
# `--claimless` builds the same claimless compiler, then every distilled cell and every inventory
# witness filed `runs` (or the programs a list file names) under both, comparing the wasm and the
# exit code: what a claim ships against what legacy would write (`claimless: identical N, fail under
# both N, differ N`). It sees what the armed shadow cannot, a claim built before legacy runs.
# `--compare` and `--compare-errors` are those two comparisons alone, over builds `build_all`
# left in two dirs (each file's `.rc`, `.err` and, built, `.wasm`).
# A build the 60 s limit stopped on either side prints `TIMEOUT f (a|b|both)` and counts in the
# summary's `timeout N`, never as a differ: it is no reading, and the run refuses it (exit 3, after
# any differ's exit 1). The logs of every non-identical file are kept under $IR_IDENTITY_KEEP
# (default $TMPDIR/ir-identity-keep/<run>/). A byte differ of a program that
# scripts/ir-divergence-baseline.txt lists prints `expected divergence f (fns)` and passes when every
# function whose body differs (`--names` builds, `wasm-dis`) is listed for it; `scripts/ir-parity.vl`
# proves those still behave alike. `--build-claimless <seed> <out>` writes the claimless compiler alone.
# Either exits 1 on any other difference. Run from the checkout root; $VL names the host, $JOBS the
# fan-out (default 4); $VL defaults to the checkout's host. Temp files live under $TMPDIR and are removed on exit.
set -euo pipefail
export VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
# An invalid IR-claimed module is rc 70, never legacy's fallback bytes, so no differ hides behind it.
export VL_IR_STRICT=1
T=$(mktemp -d)
# The build logs of every file that was not identical (a differ or a timeout) outlive the run,
# under $IR_IDENTITY_KEEP (default $TMPDIR/ir-identity-keep/<run>/), so a reading can be explained.
KEEP=${IR_IDENTITY_KEEP:-${TMPDIR:-/tmp}/ir-identity-keep/$(date +%Y%m%dT%H%M%S)-$$}
keep_logs() {
  [ -s "$T/keep" ] || return 0
  mkdir -p "$KEEP"
  while IFS=$'\t' read -r d k; do
    for e in log err rc; do [ -f "$d/$k.$e" ] && cp "$d/$k.$e" "$KEEP/$(basename "$d").$k.$e"; done
  done < "$T/keep"
  echo "kept the logs of $(cut -f2 "$T/keep" | sort -u | wc -l) non-identical files under $KEEP" >&2
}
trap 'keep_logs; rm -rf "${T:?}"' EXIT
: > "$T/keep"

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
    [ -s "$3/$k.log" ] || rm -f "$3/$k.log"
    [ "$rc" -eq 0 ] || rm -f "$3/$k.wasm"
  ' _ {} "$2" "$3" < "$1"
}

# A build `timeout 60` stopped (rc 124) under dir $2 or $3, or both: `TIMEOUT f (side)`, kept.
# A timeout is neither identical nor a differ; the run that has one is refused, not passed.
timed_out() {
  local side=""
  [ "$4" = 124 ] && side=a
  [ "$5" = 124 ] && side=${side:+both}${side:-b}
  [ -n "$side" ] || return 1
  printf '%s\t%s\n%s\t%s\n' "$2" "$6" "$3" "$6" >> "$T/keep"
  echo "TIMEOUT $1 ($side)"
}

# The divergences a lane chose (Q57): `program\tfunction\tmechanism\tPR` lines. A byte differ of a
# listed program is an `expected divergence` when every function whose body differs is listed for
# it; `<module>` names everything outside the function bodies.
BASELINE=${IR_DIVERGENCE_BASELINE:-scripts/ir-divergence-baseline.txt}
WASM_DIS=${WASM_DIS:-$PWD/node_modules/.bin/wasm-dis}
# Where `--claimless` extracts the inventory witnesses, a fresh temp dir unless $IR_IDENTITY_WIT names
# one. The baseline key of file $1: a witness written under $WIT/inv<k>/<id>/ is its row's file.
WIT=${IR_IDENTITY_WIT:-$T/wit}
bkey() {
  case "$1" in
    "$WIT"/inv1/*) local r=${1#"$WIT"/inv1/}; echo "docs/internals/inventory/${r%%/*}.md" ;;
    "$WIT"/inv2/*) local r=${1#"$WIT"/inv2/}; echo "docs/internals/inventory-2/${r%%/*}.md" ;;
    *) echo "$1" ;;
  esac
}

# A listed divergence is read through the disassembler; without it the byte differ of a listed
# program would read as a plain differ, so the run stops at the first one instead.
need_dis() {
  [ -x "$WASM_DIS" ] && return 0
  [ -f "$BASELINE" ] && awk -F '\t' -v f="$(bkey "$1")" '$1 == f { hit = 1 } END { exit !hit }' "$BASELINE" || return 0
  echo "ir-identity: $WASM_DIS is not executable, so the listed divergence of $1 cannot be read;" >&2
  echo "  link the main checkout's node_modules into this tree, or set \$WASM_DIS" >&2
  exit 2
}

# Each function of wasm $1 on one line, `name\tbody`, and `<module>\trest`, sorted by name.
fn_lines() {
  "$WASM_DIS" "$1" | awk '
    /^ \(func \$/ { if (name != "") print name "\t" body; name = $2; sub(/^\$/, "", name); body = ""; next }
    /^ \(/ { if (name != "") print name "\t" body; name = ""; rest = rest "\001" $0; next }
    { if (name != "") body = body "\001" $0; else rest = rest "\001" $0 }
    END { if (name != "") print name "\t" body; print "<module>\t" rest }
  ' | LC_ALL=C sort -t "$(printf '\t')" -k1,1
}

# The functions whose bodies differ between wasm $1 and $2 (present in one only counts), one a line.
fn_differs() {
  fn_lines "$1" > "$T/fa" && fn_lines "$2" > "$T/fb" || return 1
  LC_ALL=C join -t "$(printf '\t')" -a1 -a2 -e '<absent>' -o 0,1.2,2.2 "$T/fa" "$T/fb" \
    | awk -F '\t' '$2 != $3 { print $1 }'
}

# Whether file $1's byte differ (wasm $2 vs $3) is an expected divergence; prints its reason. With
# $SEED_A and $SEED_B set, both sides are rebuilt with `--names` so the functions carry names.
expected_divergence() {
  [ -f "$BASELINE" ] && awk -F '\t' -v f="$(bkey "$1")" '$1 == f { hit = 1 } END { exit !hit }' "$BASELINE" || return 1
  local a=$2 b=$3 fn unlisted=""
  if [ -n "${SEED_A:-}" ] && [ -n "${SEED_B:-}" ]; then
    a=$T/na.wasm; b=$T/nb.wasm
    "$VL" build "$1" -o "$a" --names --compiler "$SEED_A" > /dev/null 2>&1 || return 1
    "$VL" build "$1" -o "$b" --names --compiler "$SEED_B" > /dev/null 2>&1 || return 1
  fi
  fn_differs "$a" "$b" > "$T/fd" || return 1
  [ -s "$T/fd" ] || { echo "no function differs under --names"; return 1; }
  while read -r fn; do
    awk -F '\t' -v f="$(bkey "$1")" -v g="$fn" '$1 == f && $2 == g { hit = 1 } END { exit !hit }' "$BASELINE" \
      || unlisted="$unlisted $fn"
  done < "$T/fd"
  if [ -n "$unlisted" ]; then echo "unlisted:$unlisted"; return 1; fi
  echo "$(paste -sd, "$T/fd")"
}

# Records file key $3 of dirs $1 and $2 as not identical, so its logs are kept.
keep() { printf '%s\t%s\n%s\t%s\n' "$1" "$3" "$2" "$3" >> "$T/keep"; }

# Compares the builds of the files listed in $1 under dirs $2 and $3; prints each that differs.
# With $ERRCMP=1, a file that fails under both differs when its first diagnostic line does.
compare_all() {
  same=0; both=0; diff=0; tmo=0; expd=0; why=""
  while read -r f; do
    k=$(printf "%s" "$f" | tr "/" "_")
    why=""
    ra=$(cat "$2/$k.rc"); rb=$(cat "$3/$k.rc")
    if timed_out "$f" "$2" "$3" "$ra" "$rb" "$k"; then tmo=$((tmo + 1)); continue; fi
    [ "$ra" = "$rb" ] && { [ "$ra" != 0 ] || cmp -s "$2/$k.wasm" "$3/$k.wasm"; } \
      && { [ "$ra" = 0 ] || [ "${ERRCMP:-0}" != 1 ] || cmp -s "$2/$k.err" "$3/$k.err"; } || keep "$2" "$3" "$k"
    if [ "$ra" != "$rb" ]; then diff=$((diff + 1)); echo "DIFF $f (exit $ra vs $rb)"
    elif [ "$ra" != 0 ] && [ "${ERRCMP:-0}" = 1 ] && ! cmp -s "$2/$k.err" "$3/$k.err"; then
      diff=$((diff + 1)); echo "DIFF $f (first error: $(cat "$2/$k.err") vs $(cat "$3/$k.err"))"
    elif [ "$ra" != 0 ]; then both=$((both + 1))
    elif cmp -s "$2/$k.wasm" "$3/$k.wasm"; then same=$((same + 1))
    elif need_dis "$f" && why=$(expected_divergence "$f" "$2/$k.wasm" "$3/$k.wasm"); then
      expd=$((expd + 1)); echo "expected divergence $f ($why)"
    else diff=$((diff + 1)); echo "DIFF $f${why:+ ($why)}"; fi
  done < "$1"
}

# Compares the refusals of the files listed in $1 under dirs $2 and $3: the exit code and the
# first diagnostic line, or the wasm when both build; prints each that differs.
compare_errors() {
  esame=0; ediff=0; etmo=0; eexpd=0; why=""
  while read -r f; do
    k=$(printf "%s" "$f" | tr "/" "_")
    why=""
    ra=$(cat "$2/$k.rc"); rb=$(cat "$3/$k.rc")
    if timed_out "$f" "$2" "$3" "$ra" "$rb" "$k"; then etmo=$((etmo + 1)); continue; fi
    if [ "$ra" != "$rb" ] || { [ "$ra" = 0 ] && ! cmp -s "$2/$k.wasm" "$3/$k.wasm"; } \
      || ! cmp -s "$2/$k.err" "$3/$k.err"; then keep "$2" "$3" "$k"; fi
    if [ "$ra" != "$rb" ]; then ediff=$((ediff + 1)); echo "DIFF $f (exit $ra vs $rb)"
    elif [ "$ra" = 0 ] && ! cmp -s "$2/$k.wasm" "$3/$k.wasm" \
      && why=$(expected_divergence "$f" "$2/$k.wasm" "$3/$k.wasm"); then
      eexpd=$((eexpd + 1)); echo "expected divergence $f ($why)"
    elif [ "$ra" = 0 ] && ! cmp -s "$2/$k.wasm" "$3/$k.wasm"; then ediff=$((ediff + 1)); echo "DIFF $f${why:+ ($why)}"
    elif ! cmp -s "$2/$k.err" "$3/$k.err"; then
      ediff=$((ediff + 1)); echo "DIFF $f (first error: $(cat "$2/$k.err") vs $(cat "$3/$k.err"))"
    else esame=$((esame + 1)); fi
  done < "$1"
}

# The run's verdict: 1 on a differ, else 3 on a timeout (refused, never passed), else 0.
verdict() {
  [ "$1" -eq 0 ] || return 1
  if [ "$2" -gt 0 ]; then
    echo "TIMEOUT: $2 builds hit the 60 s limit on one side or both; neither identical nor a differ."
    echo "  Rerun on a quiet box (fewer \$JOBS, nothing else running); the logs are kept."
    return 3
  fi
}

if [ "${1:-}" = "--compare" ]; then
  ERRCMP=1 compare_all "${2:?usage: --compare <list> <dir-a> <dir-b>}" "${3:?}" "${4:?}"
  echo "cases: identical $same, fail under both $both, differ $diff, timeout $tmo, expected divergence $expd"
  verdict "$diff" "$tmo"
  exit
fi

if [ "${1:-}" = "--compare-errors" ]; then
  compare_errors "${2:?usage: --compare-errors <list> <dir-a> <dir-b>}" "${3:?}" "${4:?}"
  echo "errors: same $esame, differ $ediff, timeout $etmo, expected divergence $eexpd"
  verdict "$ediff" "$etmo"
  exit
fi

# The checkout's compiler with `CLAIMED` empty, built by seed $1 to $T/claimless.wasm.
claimless() {
  cp -r compiler "$T/c0"
  awk '
    /^const CLAIMED: IrFamily\[\] = \[$/ { print "const CLAIMED: IrFamily[] = []"; skip = 1; hit = 1; next }
    skip && /^\]$/ { skip = 0; next }
    !skip { print }
    END { if (!hit) { print "ir-identity: CLAIMED not found" > "/dev/stderr"; exit 1 } }
  ' compiler/ir_build.vl > "$T/c0/ir_build.vl"
  "$VL" build "$T/c0/entry.vl" -o "$T/claimless.wasm" --compiler "$1" > /dev/null
}

if [ "${1:-}" = "--build-claimless" ]; then
  claimless "${2:?usage: --build-claimless <seed> <out.wasm>}"
  cp "$T/claimless.wasm" "${3:?usage: --build-claimless <seed> <out.wasm>}"
  exit
fi

if [ "${1:-}" = "--claimless" ]; then
  SEED=${2:?usage: scripts/ir-identity.sh --claimless <seed>}
  export FLAGS=""
  claimless "$SEED"
  SEED_A=$SEED SEED_B=$T/claimless.wasm
  if [ -n "${3:-}" ]; then cp "$3" "$T/list"; else
    ls scripts/silent-sweep/distilled/cells/*.vl scripts/silent-sweep/distilled/named/*.vl > "$T/list"
    "$VL" run scripts/ir-i8-census/witnesses.vl --compiler "$SEED" -- "$WIT" \
      docs/internals/inventory docs/internals/inventory-2 >> "$T/list"
  fi
  build_all "$T/list" "$SEED" "$T/a"
  build_all "$T/list" "$T/claimless.wasm" "$T/b"
  compare_all "$T/list" "$T/a" "$T/b"
  echo "claimless: identical $same, fail under both $both, differ $diff, timeout $tmo, expected divergence $expd"
  verdict "$diff" "$tmo"
  exit
fi

if [ "${1:-}" = "--cases" ]; then
  SEED=${2:?usage: scripts/ir-identity.sh --cases <seed>}
  export FLAGS="" ERRCMP=1
  claimless "$SEED"
  SEED_A=$SEED SEED_B=$T/claimless.wasm
  { grep -rL '^// @error' --include='*.vl' tests/cases; ls scripts/capability-probes/*.vl; } \
    | sort > "$T/list"
  build_all "$T/list" "$SEED" "$T/a"
  build_all "$T/list" "$T/claimless.wasm" "$T/b"
  compare_all "$T/list" "$T/a" "$T/b"
  echo "cases: identical $same, fail under both $both, differ $diff, timeout $tmo, expected divergence $expd"
  "$VL" run scripts/inventory/witnesses.vl --compiler "$SEED" -- --outcome emit_reject --out "$T/w" > "$T/errs"
  # A witness of the test-only refusal hook refuses only under the flag `check-filed-witnesses` passes.
  FLAGS=--test-emit-refusal build_all "$T/errs" "$SEED" "$T/ea"
  FLAGS=--test-emit-refusal build_all "$T/errs" "$T/claimless.wasm" "$T/eb"
  compare_errors "$T/errs" "$T/ea" "$T/eb"
  echo "witnesses: same $esame, differ $ediff, timeout $etmo, expected divergence $eexpd"
  verdict $((diff + ediff)) $((tmo + etmo))
  exit
fi

A=${1:?usage: scripts/ir-identity.sh <seed-a> <seed-b> [--names] | --cases <seed> | --claimless <seed>}
B=${2:?usage: scripts/ir-identity.sh <seed-a> <seed-b> [--names] | --cases <seed> | --claimless <seed>}
export FLAGS=${3:-}
SEED_A=$A SEED_B=$B
D=scripts/silent-sweep/distilled
ls "$D"/cells/*.vl "$D"/named/*.vl > "$T/list"
build_all "$T/list" "$A" "$T/a"
build_all "$T/list" "$B" "$T/b"
compare_all "$T/list" "$T/a" "$T/b"
only=0
echo "identical $same, fail under both $both, differ $diff, built under one only $only, timeout $tmo, expected divergence $expd"
"$VL" build compiler/entry.vl -o "$T/sa.wasm" --compiler "$A" $FLAGS > /dev/null
"$VL" build compiler/entry.vl -o "$T/sb.wasm" --compiler "$B" $FLAGS > /dev/null
self=0
if cmp -s "$T/sa.wasm" "$T/sb.wasm"; then echo "self-compile identical"
elif why=$(expected_divergence compiler/entry.vl "$T/sa.wasm" "$T/sb.wasm"); then
  echo "self-compile: expected divergence ($why)"
else echo "SELF-COMPILE DIFFERS${why:+ ($why)}"; self=1; fi
verdict $((diff + self)) "$tmo"
