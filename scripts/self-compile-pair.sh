#!/usr/bin/env bash
# ONE self-compile pair carries three gate verdicts: the native fixpoint, the L2 fuel and
# heap tripwire, and the survey's share rows. Each grader is the script it always was, read
# through `--pair <dir>` instead of building its own compiles.
#
#   names  = vl build compiler/entry.vl --names --compiler $SEED
#   stage4 = vl build compiler/entry.vl --compiler names    (VL_FUEL=1 VL_GC_STATS=1 VL_PROFILE_GUEST)
#
# Why this pair is enough. A `--names` build is the plain build with the `name` and `vl-src`
# custom sections appended, so `names` runs as stage 3 does and its first bytes ARE stage 3;
# native-fixpoint.sh checks both before it compares. Fuel counts guest instructions, which
# custom sections and the profiler's epoch ticks do not add to: stage 4's fuel here equals a
# plain `--compiler $SEED` build's exactly, while the build that EMITS `--names` costs about
# 5% more, which is why the fuel is taken on stage 4 and never on `names`.
#
# One row, not three: stage 4 needs `names`, so readers in other rows would only wait on it.
# The row's WALL is the two builds in series, and the gate's critical path is elsewhere.
#
#   scripts/self-compile-pair.sh               # build the pair, run all three graders
#   scripts/self-compile-pair.sh --build <dir> # build the pair into <dir> and stop
#   SELF_COMPILE_PAIR=<dir> scripts/self-compile-pair.sh   # grade a --build pair whose stage 4 is $SEED
#
# A caller holding a candidate's rung 1 can build the pair from it (`SEED=c1 --build`) as its
# fixpoint rungs: `names` is rung 2 plus custom sections and stage 4 is rung 3, so `names`'
# plain bytes == stage 4 is the c2 == c3 proof, and stage 4 is the seed the gate then grades.
set -u
cd "$(dirname "$0")/.."
VL="${VL:-scripts/vl-host/target/release/vl}"
. scripts/self-compile-gc.sh
SEED="${SEED:-build/vl-compiler.wasm}"
export VL_STD="${VL_STD:-$PWD/std}"

build_pair() {  # $1: the directory the pair is written into
  local d=$1
  timeout 300 "$VL" build compiler/entry.vl -o "$d/names.wasm" --names --compiler "$SEED" \
    > "$d/names.log" 2>&1 || { echo "self-compile pair: the --names build failed"; cat "$d/names.log"; return 1; }
  # `timeout` bounds the BUILD, never a shell around it (CLAUDE.md, "timeout KILLS THE SHELL").
  { time -p VL_FUEL=1 VL_GC_STATS=1 VL_PROFILE_GUEST="$d/profile.json" \
      timeout 600 "$VL" build compiler/entry.vl -o "$d/stage4.wasm" --compiler "$d/names.wasm"; } \
    > "$d/stage4.log" 2> "$d/stage4.time" || {
    echo "self-compile pair: stage 4 FAILED (rc above; 124 is a real hang)"; cat "$d/stage4.time"; return 1; }
}

if [ "${1:-}" = "--build" ]; then
  [ -n "${2:-}" ] || { echo "usage: scripts/self-compile-pair.sh [--build <dir>]"; exit 2; }
  mkdir -p "$2" && build_pair "$2"
  exit $?
fi

# `SELF_COMPILE_PAIR=<dir>`: grade a pair a caller already built with `--build` (the merge
# audit builds it as its fixpoint rungs, so building it again here is two self-compiles spent
# twice). It is used only if its stage 4 IS the seed being graded; anything else is rebuilt.
OWN="$(mktemp -d)"
trap 'rm -rf "$OWN"' EXIT
WORK="$OWN"; PRE="${SELF_COMPILE_PAIR:-}"
if [ -n "$PRE" ] && [ -s "$PRE/names.wasm" ] && [ -s "$PRE/stage4.time" ] && cmp -s "$PRE/stage4.wasm" "$SEED"; then
  echo "self-compile pair: grading the pair prebuilt in $PRE (its stage 4 is the seed)"
  WORK="$PRE"
elif [ -n "$PRE" ]; then
  echo "self-compile pair: SELF_COMPILE_PAIR=$PRE is not this seed's pair; building one"
fi
if [ "$WORK" = "$OWN" ] && ! build_pair "$WORK"; then
  # No verdict can be read without the pair; the fixpoint is red by definition (the compiler
  # did not rebuild itself), and the other two have nothing to grade.
  echo
  printf '%-22s FAILED (the pair did not build)\n' "native-fixpoint" "self-compile time" "survey measurements"
  exit 1
fi

# Every grader runs even after one fails, so a red names all of its causes at once.
FAIL=0; SUMMARY=""
grade() {  # $1: the verdict's name, then its command
  local name=$1 rc; shift
  echo "== $name =="
  "$@"; rc=$?
  [ $rc = 0 ] && SUMMARY+="$(printf '%-22s ok' "$name")"$'\n' ||
    { FAIL=1; SUMMARY+="$(printf '%-22s FAILED rc=%d' "$name" $rc)"$'\n'; }
}
grade "native-fixpoint" bash scripts/native-fixpoint.sh --pair "$WORK"
grade "self-compile time" bash scripts/self-compile-time.sh --pair "$WORK"
grade "survey measurements" bash scripts/survey-profile.sh --pair "$WORK"
echo; printf '%s' "$SUMMARY"
exit $FAIL
