#!/usr/bin/env bash
# The PR gate, as ONE command, fanned out.
#
# Every gate below is independent once the seed is built, so they run concurrently and the
# wall clock is the slowest one rather than the sum. That matters: a merge gate that takes
# longer than a coffee stops being run, and the census after-pass this replaces took ~35
# MINUTES — it was re-deriving, on every merge, a population whose behavioural content
# compresses 169x (250,238 cells -> 1,477 behavioural classes; see
# scripts/silent-sweep/distilled/README.md). The distilled corpus asks the same question in
# under ten seconds, so it is IN the gate rather than beside it.
#
# Each gate's exit code is captured and reported in a table. That is deliberate: the rule
# "read a gate by its exit code, never by `tail -1`" is a rule people forget, so this makes
# it structural — `lint-self.sh` interleaves two halves and only its own summary line means
# both passed, and a pipeline's rc is the LAST command's, which has silently masked a
# failure in this repo before.
#
#   scripts/gate.sh              # everything
#   scripts/gate.sh --no-build   # reuse build/vl-compiler.wasm as it stands
set -u
cd "$(dirname "$0")/.."
LOGS="${TMPDIR:-/tmp}/vl-gate.$$"; mkdir -p "$LOGS"
: "${JOBS:=4}"; : "${DENO_JOBS:=4}"; export JOBS DENO_JOBS

if [ "${1:-}" != "--no-build" ]; then
  echo "== building the seed (everything below reads it) =="
  if ! bash scripts/refresh-compiler.sh > "$LOGS/build.log" 2>&1; then
    echo "SEED BUILD FAILED — nothing else can be trusted; see $LOGS/build.log"; tail -20 "$LOGS/build.log"; exit 1
  fi
  grep -E 'refreshed|bytes' "$LOGS/build.log" | tail -1
fi

NAMES=(); PIDS=(); STARTS=()
run() { NAMES+=("$1"); STARTS+=("$(date +%s.%N)"); shift
        ( "$@" > "$LOGS/${#PIDS[@]}.log" 2>&1 ) & PIDS+=($!); }

run "deno task test"           deno task test
run "ci-native"                env SELFHOST_NATIVE_ALIGN=1 bash -c \
                                 'deno test -A --no-check --parallel tests/selfhost_native_*_test.ts tests/vl_*_test.ts'
run "native-fixpoint"          bash scripts/native-fixpoint.sh
run "lint-self + fmt"          bash scripts/lint-self.sh
run "deno lint"                deno lint
run "rep-fuzz"                 bash scripts/rep-fuzz-check.sh
run "mono-tyaram-grid"         bash scripts/mono-tyaram-grid.sh
run "filed witnesses"          python3 scripts/check-filed-witnesses.py --strict docs/internals/silent-class-inventory.md
run "distilled corpus"         python3 scripts/silent-sweep/distilled/regress.py build/vl-compiler.wasm

FAIL=0
printf '\n%-22s %8s  %s\n' "GATE" "TIME" "RESULT"
for i in "${!PIDS[@]}"; do
  wait "${PIDS[$i]}"; rc=$?
  el=$(echo "$(date +%s.%N) - ${STARTS[$i]}" | bc)
  if [ $rc -eq 0 ]; then printf '%-22s %7.1fs  ok\n' "${NAMES[$i]}" "$el"
  else FAIL=1; printf '%-22s %7.1fs  FAILED rc=%d   %s\n' "${NAMES[$i]}" "$el" "$rc" "$LOGS/$i.log"; fi
done

if [ $FAIL -ne 0 ]; then echo; echo "GATE FAILED — logs in $LOGS"; exit 1; fi
echo; echo "ALL GATES PASS ✅  (logs in $LOGS)"
