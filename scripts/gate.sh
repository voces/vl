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
# Everything this gate starts is a preferred OOM victim, ahead of the session that ran it.
[ "$(cat /proc/self/oom_score_adj 2>/dev/null || echo 1000)" -lt 300 ] && echo 300 >/proc/self/oom_score_adj 2>/dev/null
cd "$(dirname "$0")/.."
# A builder worktree runs preflight, not the gate: the merge queue gates every PR on the merged
# tree, so a builder's own full run is spent twice. GATE_IN_WORKTREE=1 overrides.
case "$PWD" in */.claude/worktrees/*) [ "${GATE_IN_WORKTREE:-0}" = 1 ] || {
  echo "gate.sh: refusing in a builder worktree ($PWD); run ~/.claude/vl-tools/preflight.sh, or set GATE_IN_WORKTREE=1" >&2; exit 2; } ;; esac
# Pin std: to THE TREE BEING GRADED. The host resolves std: from the BINARY's
# checkout, and a worktree's binary is a symlink to the main repo's — so without
# this, every gate that shells the CLI grades a std-touching branch against the
# WRONG std (measured 2026-09-01: the toString rename's lint-self failed on
# "toString is not exported" read from the main repo's pre-rename std, while the
# same command with VL_STD pinned passed). Callers may still override.
export VL_STD="${VL_STD:-$PWD/std}"
# scripts/compat/ stands in for a GNU tool a host lacks (macOS has no `timeout`). It goes LAST
# on PATH, so wherever the real tool exists (Linux, CI) it still wins and nothing changes.
export PATH="$PATH:$PWD/scripts/compat"
# $VL_TMP: put every row's temp files in one directory, e.g. one the virus scanner skips.
if [ -n "${VL_TMP:-}" ]; then
  mkdir -p "$VL_TMP"
  if command -v cygpath >/dev/null; then
    export TMPDIR="$(cygpath -u "$VL_TMP")" TMP="$(cygpath -w "$VL_TMP")" TEMP="$(cygpath -w "$VL_TMP")"
  else
    export TMPDIR="$VL_TMP" TMP="$VL_TMP" TEMP="$VL_TMP"
  fi
fi
# macOS's TMPDIR sits under the /var -> /private/var symlink, and tests that compare a path a
# tool printed against the one they made would read two spellings of one directory.
if ! command -v cygpath >/dev/null && [ -n "${TMPDIR:-}" ] && [ -d "$TMPDIR" ]; then
  TMPDIR="$(cd "$TMPDIR" && pwd -P)"; export TMPDIR
fi
LOGS="${TMPDIR:-/tmp}/vl-gate.$$"; mkdir -p "$LOGS"
# The logs are removed when every row passed (177 dirs had piled up in a day). A failure keeps
# them: callers copy the failed rows' logs out of $LOGS. GATE_PASSED is set only on the two
# passing exits below; GATE_KEEP_LOGS=1 keeps them regardless.
GATE_PASSED=0
trap '[ "$GATE_PASSED" = 1 ] && [ "${GATE_KEEP_LOGS:-0}" != 1 ] && rm -rf "$LOGS"' EXIT
: "${JOBS:=4}"; : "${DENO_JOBS:=4}"; export JOBS DENO_JOBS
# The native binary and the seed, for the rows written in VL. One row is today
# (`seed size`, ported from Python); the paths are the ones every suite derives.
VL="${VL:-$PWD/scripts/vl-host/target/release/vl}"
SEED="${SEED:-$PWD/build/vl-compiler.wasm}"
# The suites' binaryen: the native release at package.json's version, which writes the same
# bytes as npm's JS build at a fraction of the CPU (npm's was ~60% of ci-native's, 2026-10-17).
# Where it cannot be fetched the suites fall back to npm's, slower and still correct.
if [ -z "${VL_BINARYEN:-}" ]; then
  if VL_BINARYEN=$(bash scripts/fetch-binaryen.sh); then export VL_BINARYEN
  else unset VL_BINARYEN; echo "gate.sh: no native binaryen; the suites use npm's (slower)" >&2; fi
fi

# THE BUILD IS THE SELF-COMPILE PAIR when it can be. The pair built from the seed on disk is
# `names` (that seed's `--names` build of the source) and `stage4` (what `names` compiles).
# When `stage4` equals `names`' plain bytes, the seed the source builds reproduces itself:
# `stage4` ships, and the `self-compile pair` row grades this pair (SELF_COMPILE_PAIR) instead of
# compiling two more. Two self-compiles in series, where refresh plus the row's pair was three.
# Anything else (no seed, a build that fails, a codegen change that is not yet a fixpoint)
# takes scripts/refresh-compiler.sh as before, and the row builds its own pair.
build_from_pair() {
  local pair="$LOGS/pair" s4
  [ -s "$SEED" ] || return 1
  mkdir -p "$pair"
  SEED="$SEED" bash scripts/self-compile-pair.sh --build "$pair" || return 1
  s4=$(wc -c < "$pair/stage4.wasm")
  cmp -s -n "$s4" "$pair/names.wasm" "$pair/stage4.wasm" || { echo "not a first-level fixpoint"; return 1; }
  printf 'print(6 * 7)\n' > "$pair/hello.vl"
  [ "$("$VL" run "$pair/hello.vl" --compiler "$pair/stage4.wasm" 2>&1)" = 42 ] || { echo "stage4 fails the sanity run"; return 1; }
  cp "$pair/stage4.wasm" "$SEED.gate-tmp" && mv "$SEED.gate-tmp" "$SEED" || return 1
  rm -f "$SEED".*.cwasm
  VL="$VL" scripts/warm-seed.sh "$SEED" && VL="$VL" scripts/record-seed-provenance.sh "$SEED" || return 1
  echo "built $SEED ($(wc -c < "$SEED") bytes) as the self-compile pair's stage 4"
}
if [ "${1:-}" != "--no-build" ]; then
  echo "== building the seed (everything below reads it) =="
  if build_from_pair > "$LOGS/build.log" 2>&1; then
    export SELF_COMPILE_PAIR="$LOGS/pair"
  elif ! bash scripts/refresh-compiler.sh >> "$LOGS/build.log" 2>&1; then
    echo "SEED BUILD FAILED — nothing else can be trusted; see $LOGS/build.log"; tail -20 "$LOGS/build.log"; exit 1
  fi
  grep -E 'refreshed|bytes' "$LOGS/build.log" | tail -1
fi

NAMES=(); PIDS=(); STARTS=()
# WALL is each gate's OWN elapsed, which is why the subshell stamps its finish into
# `$LOGS/<i>.t`: the report loop `wait`s in index order and a job that already exited
# returns instantly, so an elapsed computed there is the loop's clock. No stamp falls back
# to that reading. CPU is the same subshell's `times`, whose second line is its reaped
# children's user+sys — the whole row's process tree, which the box cannot inflate.
# `GATE_MAX_PAR` caps how many rows run at once (unset or 0: all at once), for a box shared
# with a foreground user. A row's WALL starts when it launches, not while it queues.
# On Windows the default is 6, where running every row at once loses to contention (README,
# "Developing on Windows").
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) : "${GATE_MAX_PAR:=6}" ;; esac
GATE_MAX_PAR="${GATE_MAX_PAR:-0}"; GATE_MAX_PAR="${GATE_MAX_PAR//[!0-9]/}"; GATE_MAX_PAR="${GATE_MAX_PAR:-0}"
# `--fast`: a local pre-push check, NOT the merge gate. It skips the rows whose cost is the
# slow tail of the gate (whole-corpus grades, timing measurements, the fixpoints, the full
# native suite) and ends with a line no merge tooling reads as a pass.
FAST=0
for a in "$@"; do [ "$a" = --fast ] && FAST=1; done
SLOW_ROWS="|ci-native|scaling shape|filed witnesses|distilled corpus|baseline freshness|self-compile pair|rep-fuzz|plumb-shape cost|"
SKIPPED=()
# `GATE_CI_PROOF=<sha>`: a push-event CI run of <sha> already ran some rows on this tree and
# this seed. scripts/ci-proof.sh checks that every input matches and names the rows; they are
# reported as `ci` instead of being run again. Any refusal, and no variable, runs every row.
CI_PROVEN="|"; CI_PROOF_RUN=""
if [ -n "${GATE_CI_PROOF:-}" ]; then
  if proven=$(bash scripts/ci-proof.sh verify "$GATE_CI_PROOF" "$SEED" 2>"$LOGS/ci-proof.err"); then
    while IFS= read -r r; do CI_PROVEN="$CI_PROVEN$r|"; done <<< "$proven"
    CI_PROOF_RUN=$(cat "$LOGS/ci-proof.err")
  fi
  cat "$LOGS/ci-proof.err"
fi
CI_SKIPPED=()
# bash 3.2 (macOS's /bin/bash) has no `wait -n`; there a queued row polls once a second.
if [ "${BASH_VERSINFO[0]}" -gt 4 ] || { [ "${BASH_VERSINFO[0]}" = 4 ] && [ "${BASH_VERSINFO[1]}" -ge 3 ]; }; then
  wait_any() { wait -n 2>/dev/null || true; }
else
  wait_any() { sleep 1; }
fi
# A BSD `date` older than macOS 26 prints `%N` literally; perl's clock stands in there.
if [ "$(date +%N)" != N ]; then now() { date +%s.%N; }
else now() { perl -MTime::HiRes=time -e 'printf "%.6f\n", time'; }; fi
run() { if [ "$FAST" = 1 ] && [[ "$SLOW_ROWS" == *"|$1|"* ]]; then SKIPPED+=("$1"); return 0; fi
        if [[ "$CI_PROVEN" == *"|$1|"* ]]; then CI_SKIPPED+=("$1"); return 0; fi
        if [ "$GATE_MAX_PAR" -gt 0 ]; then
          while [ "$(jobs -rp | wc -l)" -ge "$GATE_MAX_PAR" ]; do wait_any; done
        fi
        local i=${#PIDS[@]}; NAMES+=("$1"); STARTS+=("$(now)"); shift
        ( "$@" > "$LOGS/$i.log" 2>&1; rc=$?; now > "$LOGS/$i.t"; times > "$LOGS/$i.cpu"; exit $rc ) & PIDS+=($!); }
# `times` prints `<m>m<s>s <m>m<s>s`; sum both into seconds.
cpusec() { local tot=0 p m x
           for p in "$@"; do m=${p%%m*}; x=${p#*m}; x=${x%s}; tot=$(awk -v t="$tot" -v m="$m" -v x="$x" 'BEGIN { print t + m * 60 + x }'); done
           printf '%s' "$tot"; }

# THE SUITE ROWS' FILE SETS, derived here so each file runs in exactly ONE row: 46 ran
# twice and 2 ran three times, which is that much extra contention on the two rows whose
# verdict IS a measurement (`scaling shape`, `self-compile time`). gate.sh only — deno.json
# and ci.yml keep the full set, CI running them as separate jobs (pass-2 survey §7).
#
# A file the three single-file rows below own leaves both lists, so the dedicated row is
# the only place it runs. vl_scaling_shape_test.ts is the one that must: its runtime pairs
# grade a CPU RATIO, and measured concurrently with itself that grades the box (its compile
# pairs grade guest fuel, which load cannot move). The other two are pure
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
DEDUPE=$(printf '%s\n%s\n%s\n' "$CI_NATIVE" "$LSP_CI" "$OWN_ROW" | sort -u | paste -sd, -)

# ROW 1 TAKES THE COMPLEMENT. `deno task test` is the row that gives way, not ci-native:
# every `ignore:` in the 57 files reading SELFHOST_NATIVE_ALIGN is a NEGATIVE gate, so
# ci-native's face is a strict SUPERSET, and the other 46 run identically either way.
#
# $CI_NATIVE / $LSP_CI are deliberately UNQUOTED — the word split on their newlines is what
# turns each list into argv, and they hold `tests/<name>.ts` and nothing else. Through a
# `bash -c` instead, every newline would be a COMMAND separator (measured: 78 of
# ci-native's 79 files ran as commands, rc=126).
# THE CORPUS ORACLE (tests/cases_wasm_{0..3}_test.ts) is the V8 face of the ~5,300-fixture
# tests/cases corpus, and it carries the corpus's content here: @error message text and spans,
# @warning/@hint/@info, and an error-tier lint on a case that declares none. Neither face covers
# the other: ci-native's selfhost_native_align_test.ts alone grades the CLI's diagnostic STAGE
# and the whole-graph `vl check` of a multi-file case (a mutation of each reds one face only).
# GATE_V8_CORPUS=0 drops the oracle from row 1, and so does a CI proof: checks-suites ran it.
ORACLE=$(ls tests/cases_wasm_*_test.ts | paste -sd, -)
if [[ "$CI_PROVEN" == *"|corpus oracle|"* ]]; then GATE_V8_CORPUS=0; CI_SKIPPED+=("corpus oracle"); fi
[ "${GATE_V8_CORPUS:-1}" = 1 ] && ROW1_IGNORE="$DEDUPE" || ROW1_IGNORE="$DEDUPE,$ORACLE"
# shellcheck disable=SC2086
run "deno task test"           deno test -A --no-check --parallel --ignore="$ROW1_IGNORE" tests/
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
# THE SELF-COMPILE PAIR: the native fixpoint, the L2 fuel and heap tripwire, and the survey's
# share rows, read off ONE pair of self-compiles — the seed's `--names` build, then that build
# compiling the compiler under fuel, GC stats and the guest profiler. Each verdict is still its
# own script's (`--pair`), and the summary names which of the three failed.
#
# THE SURVEY'S NUMBERS, re-read. `code-quality-survey-2026-09/` schedules work by share and
# by count, and nothing re-ran one of them: row 8 said "campaign" for work #2607
# had shipped, and row 7 named two functions #2567 merged away. survey-profile.sh runs each
# row's own `Measure:` block, and REDS only on a number that cannot be re-read at all — a row
# that moved is printed, since movement is the finding. `--require-profile` makes a missing
# profile a failure: without one the share rows report `skipped`, which exits 0.
#
# NOT SKIPPED UNDER GATE_FIXPOINT_PROVEN. The fuel and the profile need the pair's builds
# anyway, and the fixpoint is a `cmp` of two files they leave, so re-proving it costs nothing.
# A caller that built the pair as its own fixpoint rungs passes `SELF_COMPILE_PAIR=<dir>`, and
# the row grades that pair instead of compiling it again, when its stage 4 is this seed.
run "self-compile pair"        bash scripts/self-compile-pair.sh
run "lint-self + fmt"          bash scripts/lint-self.sh
# The comment-budget, kind-ladder, sentinel-index, arena-scan and prefer-interpolation
# RATCHETS are held inside "lint-self + fmt": each counts the findings that row's
# compiler-graph, std/ and scripts/ lints already produced (`vl check --budget
# --findings`) instead of walking its targets again. `arena-scan-outside-pass` is the
# guard that stops a whole-program scan being added outside a pass (#2419's class).
# The seed-size RATCHET: the compiler's own bytes, against a committed baseline, so a
# jump names the landing that bought it rather than being found weeks later. It reads
# the seed built above — ONE self-compile, which off a stale seed is the OLD codegen's
# output; ci-native runs it straight after `--prove-fixpoint`, and that reading is the
# deciding one.
# WRITTEN IN VL, and it measures the seed it is compiled by, so this row now needs the
# binary and a working seed where the Python needed neither. That is the point — the
# first orchestrator script the language runs on itself — and it is why the row sits
# after the build rather than beside the file scans.
run "seed size"                "$VL" run scripts/seed-size.vl --compiler "$SEED" -- --check
# The late-demand RATCHET: elaboration keys minted after `elabRun` returned, per file,
# against scripts/late-demands-baseline.txt. `$VL_BIN` makes the sweep use this host.
run "late demands"             env VL_BIN="$VL" "$VL" run scripts/late-demands.vl --compiler "$SEED" -- --check --seed "$SEED"
# No Python anywhere in the tree: a tracked .py file or a python invocation in a script fails.
run "no-python"                "$VL" run scripts/no-python.vl
# No `emitter state` row: lane L7's invariant (`emitter-state-audit.vl --check`, 0 never-cleared)
# is held by tests/vl_emitter_state_audit_test.ts, which `ci-native` runs - it asserts --check
# exits 0 on the tree and reds when one reset's clears are ignored.
# THE COST OF GENERATED CODE: guest fuel and peak RSS of one `-O` build of each of two 2 MB
# plumb-shaped units (a median one, and a one-function tail one), against a committed
# baseline, plus two exact facts about the rung input. Fuel, RSS and the facts come from one
# metered build per unit; fuel is a count, so the fan-out's contention cannot move it. CPU
# is graded only from runs a control says were quiet, which inside this fan-out is usually
# none, and a build after a loud control is not run at all: ~11 s and ~10 CPU-s busy, ~30
# CPU-s quiet, plus ~25 CPU-s once per new seed while the sidecars compile. #3108, #3112,
# D2335 and D2336 are what it holds.
run "plumb-shape cost"         "$VL" run scripts/plumb-shape-cost.vl --compiler "$SEED" -- --check
# The kind-ladder RATCHET rides "lint-self + fmt"; this row re-derives the lint's copy of
# every closed set from the `export type` that declares it and FAILS on drift.
run "kind-ladder sets"         "$VL" run scripts/ladder-sets.vl --compiler "$SEED"
# The dead-export RATCHET, of the same shape: `unused-function` exempts an exported
# declaration ("public surface"), so for a tree whose only consumer is itself the export
# list is a blind spot — 19 exports were in it when this landed. Its baseline is at ZERO
# because the tree reached zero in the PR that added it. No lint sees a reference from
# another tree, so scripts/dead-exports.vl writes the report and
# `vl check --budget --findings` counts it.
dead_export_budget() {
  "$VL" run scripts/dead-exports.vl --compiler "$SEED" -- --out "$LOGS/dead-exports.json" &&
    "$VL" check --budget scripts/export-budget-baseline.json \
      --findings "$LOGS/dead-exports.json" --compiler "$SEED"
}
run "dead-export budget"       dead_export_budget
# The render-parse RATCHET, of the same shape: `tyToEmitName(` calls and the ten
# type-string parsers in the emitter. A rep is decided from the checked type, not from
# a rendered spelling parsed back (code-quality-2026-10.md L2). scripts/render-parse-census.vl
# writes the report, `vl check --budget --findings` counts it.
render_parse_budget() {
  "$VL" run scripts/render-parse-census.vl --compiler "$SEED" -- --out "$LOGS/render-parse.json" &&
    "$VL" check --budget scripts/render-parse-budget-baseline.json \
      --findings "$LOGS/render-parse.json" --compiler "$SEED"
}
run "render-parse budget"      render_parse_budget
# THE SHAPE FAMILY: pairs of the same work, one axis reshaped, graded on the ratio of
# the compiler's guest FUEL (a count, so load cannot move it; the runtime pairs on CPU).
# ~40 s, and it reds on the pre-#2419 compiler.
run "scaling shape"            deno test -A --no-check tests/vl_scaling_shape_test.ts
run "deno lint"                deno lint
run "rep-fuzz"                 bash scripts/rep-fuzz-check.sh
# THE DIRECTORY, not the monolith: the inventory is one file per row
# (`docs/internals/inventory/D1042.md`). The checker reads either form and a directory
# holding no rows yet falls back to the monolith named in its own README, so this line is
# the same before and after the split lands and does not need touching on merge day.
#
# BOTH INVENTORIES. `inventory-2/` holds the coverage gaps of inventory #1 and numbers
# independently — D1-D14 exist in both as different defects, which is why it is a second
# directory and not a merge. Its 17 rows were re-run by NOTHING: both TS halves of the row
# discipline already list both paths, and this line named one. They graded `17 as filed`
# the day they were added here, so the gap was latent rather than a live wrong claim —
# which is exactly the state a filed row is supposed to decay into unnoticed.
#
# `--self-test` first: the grader's outcome vocabulary and its `Want:` output rule are each
# seen to fire on specimens before the rows are graded by them. The grader is the VL port;
# the Python stays beside it, and tests/vl_check_filed_witnesses_test.ts holds them equal.
run "filed witnesses"          bash -c "\"$VL\" run scripts/check-filed-witnesses.vl --compiler \"$SEED\" -- --self-test >/dev/null && \"$VL\" run scripts/check-filed-witnesses.vl --compiler \"$SEED\" -- --strict docs/internals/inventory docs/internals/inventory-2"
# THE OTHER HALF: a row that stopped EXISTING. #2405 resolved a conflict in the inventory's
# tail and deleted a ROW, with its citations left standing, and every gate was green —
# the instruments above all read the rows that are there. ~0.2s, and it also runs inside
# `deno task test` and the ci-native `vl_*_test.ts` glob; its own row here so the table
# names it rather than burying it in a suite of hundreds.
run "inventory refs"           deno test -A --no-check tests/vl_inventory_refs_test.ts
# THE PROBES' BEHAVIOURAL HALF. `tests/vl_live_sites_test.ts` checks the list's STRUCTURE
# and says the compiling half is `capability-probes.vl --live-sites`, which no gate ran: on 2026-09-24 four
# of its rows had moved (one a compiler trap, one invalid wasm) and nothing was red (D2301).
# `--floor` holds every probe to clause 1; a refusal passes, a trap or bad module does not.
# Both run on `scripts/capability-probes.vl`.
run "capability probes"        bash -c "\"$VL\" run scripts/capability-probes.vl --compiler \"$SEED\" -- --live-sites --compiler \"$SEED\" && \"$VL\" run scripts/capability-probes.vl --compiler \"$SEED\" -- --floor --compiler \"$SEED\""
run "conflict markers"        deno test -A --no-check tests/vl_no_conflict_markers_test.ts
run "splice scan"              bash -c "\"$VL\" run scripts/inventory/splice-scan.vl --compiler \"$SEED\" -- --self-test >/dev/null && \"$VL\" run scripts/inventory/splice-scan.vl --compiler \"$SEED\""
# ON MASTER the same run also requires the committed baseline to describe the committed seed
# exactly (`--verify-fresh`: exit 1 when any cell moved, after the runs-lost check). A branch
# is SUPPOSED to disagree with it — that disagreement is the change being measured. On master
# it is the check that a merge did not forget `--write-baseline`: six cells shipped
# mis-recorded on 2026-08-31 and the scoreboard, which reads the baseline, under-reported
# `runs` by six until an agent noticed while diffing its own corpus run. One run grades the
# cells once for both questions.
if [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "master" ]; then
  run "distilled corpus"       "$VL" run scripts/silent-sweep/distilled/regress.vl --compiler "$SEED" -- build/vl-compiler.wasm --verify-fresh
else
  run "distilled corpus"       "$VL" run scripts/silent-sweep/distilled/regress.vl --compiler "$SEED" -- build/vl-compiler.wasm
fi

FAIL=0
# WALL is contended — every row is measured with all its siblings on the box, so it reads
# up to 3.8x the row's cost and a scheduling decision taken off it is wrong by that much.
# CPU is the row's own user+sys, which contention cannot inflate: WALL/CPU is the waiting,
# so a row that is SLOW (high CPU) and one that is STARVED (high WALL, low CPU) separate.
echo
echo "WALL = elapsed once launched   CPU = the row's own user+sys (WALL>>CPU means starved, not slow)"
printf '%-22s %8s %8s  %s\n' "GATE" "WALL" "CPU" "RESULT"
for i in "${!PIDS[@]}"; do
  wait "${PIDS[$i]}"; rc=$?
  fin=$(cat "$LOGS/$i.t" 2>/dev/null)
  [ -n "$fin" ] || fin=$(now)
  el=$(awk -v f="$fin" -v s="${STARTS[$i]}" 'BEGIN { print f - s }')
  cpu=$(cpusec $(tail -1 "$LOGS/$i.cpu" 2>/dev/null))
  [ -n "$cpu" ] || cpu=0
  if [ $rc -eq 0 ]; then printf '%-22s %7.1fs %7.1fs  ok\n' "${NAMES[$i]}" "$el" "$cpu"
  else FAIL=1; printf '%-22s %7.1fs %7.1fs  FAILED rc=%d   %s\n' "${NAMES[$i]}" "$el" "$cpu" "$rc" "$LOGS/$i.log"; fi
done
for r in "${CI_SKIPPED[@]+"${CI_SKIPPED[@]}"}"; do printf '%-22s %8s %8s  ci (proven)\n' "$r" - -; done
[ -z "$CI_PROOF_RUN" ] || echo "${CI_PROOF_RUN#ci-proof: }"

if [ $FAIL -ne 0 ]; then
  echo; echo "GATE FAILED — logs in $LOGS"; exit 1
fi
GATE_PASSED=1
if [ "$FAST" = 1 ]; then
  echo; echo "FAST TIER PASSED — not the merge gate; skipped: ${SKIPPED[*]}  (logs $([ "${GATE_KEEP_LOGS:-0}" = 1 ] && echo "kept in $LOGS" || echo removed))"
  exit 0
fi
echo; echo "ALL GATES PASS ✅  (logs $([ "${GATE_KEEP_LOGS:-0}" = 1 ] && echo "kept in $LOGS" || echo removed))"
