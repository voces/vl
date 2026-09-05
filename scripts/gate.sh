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
# The TIME column is each gate's OWN wall time, which is why the subshell stamps its
# finish into `$LOGS/<i>.t`. The report loop `wait`s in index order and a job that already
# exited returns from `wait` instantly, so an elapsed computed there is the loop's clock,
# not the gate's — 19 of 21 rows read the same number. No stamp falls back to that reading.
run() { local i=${#PIDS[@]}; NAMES+=("$1"); STARTS+=("$(date +%s.%N)"); shift
        ( "$@" > "$LOGS/$i.log" 2>&1; rc=$?; date +%s.%N > "$LOGS/$i.t"; exit $rc ) & PIDS+=($!); }

# THE SUITE ROWS' FILE SETS, derived here so each file runs in exactly ONE row: 46 ran
# twice and 2 ran three times, which is that much extra contention on the two rows whose
# verdict IS a measurement (`scaling shape`, `self-compile time`). gate.sh only — deno.json
# and ci.yml keep the full set, CI running them as separate jobs (pass-2 survey §7).
#
# A file the three single-file rows below own leaves both lists, so the dedicated row is
# the only place it runs. vl_scaling_shape_test.ts is the one that must: it grades a TIME
# RATIO, and measured concurrently with itself it grades the box. The other two are pure
# file scans — no seed, no SELFHOST_NATIVE_ALIGN — so they run identically wherever they land.
OWN_ROW=$'tests/vl_scaling_shape_test.ts\ntests/vl_inventory_refs_test.ts\ntests/vl_no_conflict_markers_test.ts'
# Filtered in bash, not with `--ignore`: `--ignore` next to an explicit multi-glob file
# LIST is order-sensitive (measured: the same flag, same files, excluded the file with one
# argument order and not another).
CI_NATIVE=$(ls tests/selfhost_native_*_test.ts tests/vl_*_test.ts | grep -vxF "$OWN_ROW")
# The ci-native JOB also runs an EXPLICIT list of seed-backed editor suites that match
# neither glob (ci.yml's "Editor features on the wasm compiler" step). Measured gap,
# 2026-09-01: nine local gates were green while master's ci-native was red on exactly
# those files (#2104×#2105). The list is extracted FROM ci.yml so the two cannot drift —
# ci_seed_coverage_test.ts guards ci.yml's side — and an empty extraction now aborts the
# whole run rather than reddening one row, because it also silently un-excludes those
# files from the row below.
LSP_CI=$(awk '/Editor features on the wasm compiler/{f=1; next} f && /- name:/{exit} f{print}' \
           .github/workflows/ci.yml | grep -oE "tests/[a-zA-Z0-9_]+\.ts" | sort -u)
[ -n "$LSP_CI" ] || { echo "no lsp suite list extracted from ci.yml — the step name that anchors the extraction was renamed or removed; fix .github/workflows/ci.yml and scripts/gate.sh together" >&2; exit 1; }
DEDUPE=$(printf '%s\n%s\n%s\n' "$CI_NATIVE" "$LSP_CI" "$OWN_ROW" | sort -u | paste -sd,)

# ROW 1 TAKES THE COMPLEMENT. `deno task test` is the row that gives way, not ci-native:
# every `ignore:` in the 57 files reading SELFHOST_NATIVE_ALIGN is a NEGATIVE gate, so
# ci-native's face is a strict SUPERSET, and the other 46 run identically either way.
#
# $CI_NATIVE / $LSP_CI are deliberately UNQUOTED — the word split on their newlines is what
# turns each list into argv, and they hold `tests/<name>.ts` and nothing else. Through a
# `bash -c` instead, every newline would be a COMMAND separator (measured: 78 of
# ci-native's 79 files ran as commands, rc=126).
# shellcheck disable=SC2086
run "deno task test"           deno test -A --no-check --parallel --ignore="$DEDUPE" tests/
# shellcheck disable=SC2086
run "ci-native"                env SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check --parallel $CI_NATIVE
# shellcheck disable=SC2086
run "lsp suites (ci list)"     env SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check --parallel $LSP_CI
# Root deno.json excludes lsp/ and every suite runs --no-check, so a type error
# in lsp/src/*.ts is invisible to all the other gates (esbuild strips types
# without checking). Mirrors ci.yml's "Type-check (lsp)" step.
# --node-modules-dir=none: resolve the mapped npm deps from deno's own cache,
# never from node_modules — the check then grades identically in CI (npm ci
# layout), the main checkout, and agent worktrees (node_modules symlinked or
# absent). Measured 2026-09-01: byonm graded three different answers across
# those three layouts under deno 2.9.6's nearest-manifest rule.
run "lsp typecheck"            deno check --node-modules-dir=none --config lsp/deno.json lsp/src/*.ts
# Same hole, for lint: root deno.json's top-level `exclude` drops lsp/ from the
# "deno lint" row below too, silently — even a path passed explicitly on the
# CLI is skipped. lsp/deno.json carries no exclude, so linting through it sees
# lsp/src/. Mirrors ci.yml's "Lint (lsp)" step.
run "lsp lint"                 deno lint --config lsp/deno.json lsp/src/
run "native-fixpoint"          bash scripts/native-fixpoint.sh
# THE L2 TRIPWIRE. Its own build rather than native-fixpoint's stage-4 number, because
# the rows here are independent by construction and the two run concurrently — one extra
# self-compile against a row that already does two costs the table nothing.
run "self-compile time"        bash scripts/self-compile-time.sh
run "lint-self + fmt"          bash scripts/lint-self.sh
# The comment-budget RATCHET: per-file counts of the two comment lint codes may only
# fall. lint-self.sh holds those codes out of its own `info` gate while the baseline
# is non-zero, so this is what stops the tree drifting back up meanwhile.
run "comment budget"           python3 scripts/comment-budget.py --check
# The seed-size RATCHET: the compiler's own bytes, against a committed baseline, so a
# jump names the landing that bought it rather than being found weeks later. It reads
# the seed built above — ONE self-compile, which off a stale seed is the OLD codegen's
# output; ci-native runs it straight after `--prove-fixpoint`, and that reading is the
# deciding one. Milliseconds; a `stat` and a comparison.
run "seed size"                python3 scripts/seed-size.py --check
# The arena-scan RATCHET, same shape and the same reason: `arena-scan-outside-pass`
# is a `warning` lint-self.sh holds out while the baseline is non-zero, so this is
# what stops a whole-program scan being added outside a pass. #2419's class.
run "arena-scan budget"        python3 scripts/scan-budget.py --check
# The kind-ladder RATCHET, third of the same shape: a ladder over a closed kind set is
# exhaustive over it or its default NAMES what it excludes. Also re-derives the lint's
# copy of every closed set from the `export type` that declares it and FAILS on drift.
run "kind-ladder budget"       python3 scripts/ladder-budget.py --check
# The sentinel-index RATCHET, fourth of the same shape: a table read whose index came
# from a reader that can answer in band is bound-tested, or takes a reader whose miss
# cannot be a real row. Four compiler TRAPS of that shape landed on 2026-09-03 — `vl
# check` rc 0, then an anonymous out-of-bounds read inside the seed (D1440, D1462, D1500
# and #2498 — and docs/internals/sentinel-index-lint.md for the controls).
run "sentinel-index budget"    python3 scripts/sentinel-budget.py --check
# The dead-export RATCHET, fifth of the same shape: `unused-function` exempts an exported
# declaration ("public surface"), so for a tree whose only consumer is itself the export
# list is a blind spot — 19 exports were in it when this landed. Its baseline is at ZERO,
# unlike the four above, because the tree reached zero in the PR that added it.
run "dead-export budget"       python3 scripts/export-budget.py --check
# THE SHAPE FAMILY: seven pairs, same work, one axis reshaped, graded on the TIME
# RATIO so machine speed and box load cancel. ~16-25 s; it is the only gate here
# whose verdict is a measurement, and it reds on the pre-#2419 compiler.
run "scaling shape"            deno test -A --no-check tests/vl_scaling_shape_test.ts
run "deno lint"                deno lint
run "rep-fuzz"                 bash scripts/rep-fuzz-check.sh
run "mono-tyaram-grid"         bash scripts/mono-tyaram-grid.sh
# THE DIRECTORY, not the monolith: the inventory is one file per row
# (`docs/internals/inventory/D1042.md`). The checker reads either form and a directory
# holding no rows yet falls back to the monolith named in its own README, so this line is
# the same before and after the split lands and does not need touching on merge day.
run "filed witnesses"          python3 scripts/check-filed-witnesses.py --strict docs/internals/inventory
# THE OTHER HALF: a row that stopped EXISTING. #2405 resolved a conflict in the inventory's
# tail and deleted a ROW, with its citations left standing, and every gate was green —
# the instruments above all read the rows that are there. ~0.2s, and it also runs inside
# `deno task test` and the ci-native `vl_*_test.ts` glob; its own row here so the table
# names it rather than burying it in a suite of hundreds.
run "inventory refs"           deno test -A --no-check tests/vl_inventory_refs_test.ts
run "conflict markers"         deno test -A --no-check tests/vl_no_conflict_markers_test.ts
run "splice scan"              bash -c "python3 scripts/inventory/splice-scan.py --self-test >/dev/null && python3 scripts/inventory/splice-scan.py"
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
  fin=$(cat "$LOGS/$i.t" 2>/dev/null)
  [ -n "$fin" ] || fin=$(date +%s.%N)
  el=$(echo "$fin - ${STARTS[$i]}" | bc)
  if [ $rc -eq 0 ]; then printf '%-22s %7.1fs  ok\n' "${NAMES[$i]}" "$el"
  else FAIL=1; printf '%-22s %7.1fs  FAILED rc=%d   %s\n' "${NAMES[$i]}" "$el" "$rc" "$LOGS/$i.log"; fi
done

if [ $FAIL -ne 0 ]; then echo; echo "GATE FAILED — logs in $LOGS"; exit 1; fi
echo; echo "ALL GATES PASS ✅  (logs in $LOGS)"
