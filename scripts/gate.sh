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
# Pin std: to THE TREE BEING GRADED. The host resolves std: from the BINARY's
# checkout, and a worktree's binary is a symlink to the main repo's — so without
# this, every gate that shells the CLI grades a std-touching branch against the
# WRONG std (measured 2026-09-01: the toString rename's lint-self failed on
# "toString is not exported" read from the main repo's pre-rename std, while the
# same command with VL_STD pinned passed). Callers may still override.
export VL_STD="${VL_STD:-$PWD/std}"
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
# The ci-native JOB also runs an EXPLICIT list of seed-backed editor suites that
# match neither glob above (ci.yml's "Editor features on the wasm compiler"
# step). Measured gap, 2026-09-01: nine local gates were green while master's
# ci-native was red on exactly those files (#2104×#2105). The list is extracted
# FROM ci.yml at run time so the two can never drift — ci_seed_coverage_test.ts
# guards ci.yml's side of the contract — and an empty extraction fails loudly
# rather than silently passing.
run "lsp suites (ci list)"     env SELFHOST_NATIVE_ALIGN=1 bash -c \
                                 'L=$(awk "/Editor features on the wasm compiler/{f=1; next} f && /- name:/{exit} f{print}" .github/workflows/ci.yml | grep -oE "tests/[a-zA-Z0-9_]+\.ts" | sort -u); [ -n "$L" ] || { echo "no lsp suite list extracted from ci.yml" >&2; exit 1; }; deno test -A --no-check --parallel $L'
# Root deno.json excludes lsp/ and every suite runs --no-check, so a type error
# in lsp/src/*.ts is invisible to all the other gates (esbuild strips types
# without checking). Mirrors ci.yml's "Type-check (lsp)" step.
# --node-modules-dir=none: resolve the mapped npm deps from deno's own cache,
# never from node_modules — the check then grades identically in CI (npm ci
# layout), the main checkout, and agent worktrees (node_modules symlinked or
# absent). Measured 2026-09-01: byonm graded three different answers across
# those three layouts under deno 2.9.6's nearest-manifest rule.
run "lsp typecheck"            deno check --node-modules-dir=none --config lsp/deno.json lsp/src/*.ts
run "native-fixpoint"          bash scripts/native-fixpoint.sh
run "lint-self + fmt"          bash scripts/lint-self.sh
run "deno lint"                deno lint
run "rep-fuzz"                 bash scripts/rep-fuzz-check.sh
run "mono-tyaram-grid"         bash scripts/mono-tyaram-grid.sh
run "filed witnesses"          python3 scripts/check-filed-witnesses.py --strict docs/internals/silent-class-inventory.md
run "distilled corpus"         python3 scripts/silent-sweep/distilled/regress.py build/vl-compiler.wasm

# ON MASTER ONLY: the committed baseline must describe the committed seed exactly. A branch
# is SUPPOSED to disagree with it — that disagreement is the change being measured — so this
# would be nonsense there. On master it is the check that a merge did not forget
# `--write-baseline`: six cells shipped mis-recorded on 2026-08-31 and the scoreboard, which
# reads the baseline, under-reported `runs` by six until an agent noticed while diffing its
# own corpus run.
if [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "master" ]; then
  run "baseline freshness"     python3 scripts/silent-sweep/distilled/regress.py build/vl-compiler.wasm --verify-fresh
fi

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
