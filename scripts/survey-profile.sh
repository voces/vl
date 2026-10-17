#!/usr/bin/env bash
# Take one guest profile of a self-compile and grade the survey's share rows against it.
#
# WHY THIS IS A GATE ROW AND NOT A MANUAL PASS. `--strict` alone is VACUOUS for a share row:
# without a profile those rows report `skipped`, and a skip is neither `moved` nor `broken`, so
# a run that measured none of them exits 0 and reads exactly like one that measured all four.
# The cost was assumed to be minutes and is not — measured 2026-09-06 on this box, the `--names`
# seed build is 4.1 s and the profiled compile 9.5 s, 13.6 s together at load 50, against a gate
# whose critical path is `distilled corpus` at ~155 s. So the share rows are gated, and
# `--require-profile` is what makes a missing profile a failure rather than a quiet skip.
set -u
cd "$(dirname "$0")/.."
VL="${VL:-scripts/vl-host/target/release/vl}"
# The profiled self-compile runs under the collector every self-compile script pins
# (scripts/self-compile-gc.sh).
. scripts/self-compile-gc.sh
SEED="${SEED:-build/vl-compiler.wasm}"
DOC=docs/internals/code-quality-survey-2026-09/README.md
export VL_STD="$PWD/std"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PROFILE="$WORK/p.json"

if [ "${1:-}" = "--pair" ]; then
  # scripts/self-compile-pair.sh took the profile on its stage 4, which is this script's
  # profiled compile: the `--names` build compiling the compiler.
  PROFILE="${2:?usage: scripts/survey-profile.sh [--pair <dir>]}/profile.json"
  [ -s "$PROFILE" ] || { echo "survey-profile: the pair left no profile at $PROFILE"; exit 1; }
else
# A guest frame reads `wasm-function[N]` without a name section, so the profile is taken
# against a `--names` build of the SAME source the seed came from, never against the seed.
timeout 300 "$VL" build compiler/entry.vl -o "$WORK/names.wasm" --names --compiler "$SEED" \
  >/dev/null || { echo "survey-profile: the --names seed build failed"; exit 1; }
VL_PROFILE_GUEST="$PROFILE" "$VL" build compiler/entry.vl --compiler "$WORK/names.wasm" \
  -o "$WORK/out.wasm" >/dev/null 2>&1 || {
  echo "survey-profile: the profiled compile failed"; exit 1; }
fi

RG=(scripts/survey-regrade.vl --compiler "$SEED" --)
"$VL" run "${RG[@]}" --self-test >/dev/null || {
  echo "survey-profile: survey-regrade.vl --self-test failed"; exit 1; }
"$VL" run "${RG[@]}" --require-profile --profile "$PROFILE" "$DOC"
exit $?
