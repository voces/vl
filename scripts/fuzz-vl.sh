#!/usr/bin/env bash
# VL-NATIVE rep-composition fuzzer — the orchestrator half. Runs `scripts/fuzzgen.vl` (the generator)
# through the native `vl`, splits its batch of self-describing `.vl` cases on `===CASE` markers, runs
# them all through ONE `vl run --batch` process (the compiler module loads once, each case still gets
# a fresh isolated store), and asserts the output matches the case's own `// @log` directive. NO Deno —
# the native host compiles + runs; the generator + the oracle (the buried literal) are pure VL.
#
# USAGE: scripts/fuzz-vl.sh [--seed N] [--count M] [--depth D] [--keep DIR] [--baseline FILE]
#                           [--shapes-out FILE] [--quiet] [--values]
#   --values        opt-in value dimension: widen leaf VALUES (0/negatives/min·max/wide-i64/non-half
#                   floats/empty·escaped·multibyte strings) + align the map-value allowNul. A survey
#                   mode — it relocates the sample onto pre-existing rep holes, so it is report-only
#                   and NOT part of the pinned net (rep-fuzz-check.sh runs the default byte-stable
#                   stream). OFF by default so the generated batch is byte-identical to master.
#   --branching     opt-in branching-TREE shapes: multi-element arrays/maps, structs with two
#                   recursive composite fields, arity-3 unions, multi-param closures (total-node
#                   budgeted). Same survey/report-only contract as --values; OFF → byte-identical.
#   --multiobs      opt-in ORACLE WIDENING (multi-observation): after the buried carrier, also read
#                   + assert the observable DECOY values (struct siblings a/z, the union decoy arm,
#                   and — composing with --branching — the map's second entry), one extra `// @log`
#                   line each. Same survey/report-only contract as --values; OFF → byte-identical.
#   --declared      opt-in DECLARED-TYPES dimension: for a struct-flavored case, hoist the struct to
#                   a `type Tn = {...}` declaration and spell it by NAME in the annotation — declared
#                   spelling, structural twins (`type A`/`type B` value-flow), and the mixed
#                   declared/inline seam (PR #911's dup-heap + inline-shape ref-list param shapes,
#                   which no inline vocabulary can reach). The `@shape` node carries a stable
#                   `decl:`/`twin:`/`mix:` marker. Same survey/report-only contract as --values;
#                   OFF → byte-identical.
#   A mismatch / compile-fail / trap is a finding, printed with the failing case + the --seed to repro.
#   Classes: REJECT (parse/type/emit error — the fail-loudly long tail), INVALID-WASM (emitted bytes
#   fail validation — a soundness hole), TRAP (runtime error), MISMATCH (silent wrong result).
#   --keep DIR      copy every failing case (+ its error) into DIR for triage.
#   --baseline FILE suppress KNOWN failures: a failure whose class-tagged `CLASS<TAB>@shape` line
#                   appears in FILE (any class — INVALID-WASM/TRAP/MISMATCH/REJECT) is a committed
#                   known issue, not a NEW finding (exit 0). A shape that got WORSE (e.g. REJECT ->
#                   INVALID-WASM) is a new line, so it still surfaces. The full bidirectional CI gate
#                   (new + stale) is rep-fuzz-check.sh; the invariant is no regression.
#   --shapes-out F  append one `CLASS<TAB>SHAPE` line per failure to F (consumed by rep-fuzz-check.sh).
#   --quiet         suppress the per-class case dumps (shape lines + summary only).
# Requires a fresh seed: bash scripts/refresh-compiler.sh
set -uo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
SEED_WASM="${SEED_WASM:-build/vl-compiler.wasm}"
SEED=$((RANDOM * RANDOM))
COUNT=200
DEPTH=4
KEEP=""
BASELINE=""
SHAPES_OUT=""
QUIET=0
VALUES=0
BRANCHING=0
MULTIOBS=0
DECLARED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --seed) SEED="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --depth) DEPTH="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    --baseline) BASELINE="$2"; shift 2 ;;
    --shapes-out) SHAPES_OUT="$2"; shift 2 ;;  # append `CLASS<TAB>SHAPE` per failure (for rep-fuzz-check.sh)
    --quiet) QUIET=1; shift ;;
    --values) VALUES=1; shift ;;  # opt-in value dimension (report-only survey; see header)
    --branching) BRANCHING=1; shift ;;  # opt-in branching-tree shapes (report-only survey; see header)
    --multiobs) MULTIOBS=1; shift ;;  # opt-in oracle widening / multi-observation (report-only survey)
    --declared) DECLARED=1; shift ;;  # opt-in declared-types dimension (report-only survey; see header)
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

[ -f "$SEED_WASM" ] || { echo "no seed at $SEED_WASM — run scripts/refresh-compiler.sh"; exit 2; }
[ -z "$KEEP" ] || mkdir -p "$KEEP"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Inject seed + count into a copy of the generator, then run it to emit the batch.
sed -e "s/^let SEED = .*/let SEED = $SEED/" -e "s/^let COUNT = .*/let COUNT = $COUNT/" -e "s/^let MAXDEPTH = .*/let MAXDEPTH = $DEPTH/" \
  -e "s/^let RICHVALUES = .*/let RICHVALUES = $VALUES/" \
  -e "s/^let BRANCHING = .*/let BRANCHING = $BRANCHING/" \
  -e "s/^let MULTIOBS = .*/let MULTIOBS = $MULTIOBS/" \
  -e "s/^let DECLTYPES = .*/let DECLTYPES = $DECLARED/" \
  scripts/fuzzgen.vl > "$WORK/gen.vl"
if ! "$VL" run "$WORK/gen.vl" --compiler "$SEED_WASM" > "$WORK/batch.txt" 2>"$WORK/generr.txt"; then
  echo "GENERATOR FAILED to run:"; cat "$WORK/generr.txt"; exit 2
fi

# Split the batch into one file per case on the `===CASE` marker, extracting each
# case's `// @log` (expected output) and `// @shape` sidecars in the same pass —
# the directives stay in the case file too, this just replaces two `sed` spawns
# per case with zero (measurable at hundreds of cases × 16 CI seeds).
awk -v dir="$WORK" '
  # close() per case: mawk caps simultaneously open files, and each case now
  # holds up to three (.vl/.log/.shape) — without this a big --count would die.
  /^===CASE/ {
    if (file) { close(file); close(file ".log"); close(file ".shape") }
    n++; file = sprintf("%s/case_%05d.vl", dir, n); next
  }
  n > 0 {
    print > file
    if (sub(/^\/\/ @log /, ""))        print > (file ".log")
    else if (sub(/^\/\/ @shape /, "")) print > (file ".shape")
  }
' "$WORK/batch.txt"

echo "fuzz-vl: seed $SEED, $(ls "$WORK"/case_*.vl 2>/dev/null | wc -l | tr -d ' ') cases"

# Run every case in ONE `vl` process (`vl run --batch`): the per-case fixed costs
# (process spawn, engine builds, deserializing the multi-MB compiler `.cwasm`)
# are paid once for the whole batch instead of once per case. Per case_N.vl it
# writes $WORK/out/case_N.vl.out (print output) and, on failure, .err — the same
# rendered error a failing `vl run` prints, so the classification below greps
# identical text. A batch-runner failure (not a case failure) is fatal.
if ls "$WORK"/case_*.vl >/dev/null 2>&1; then
  "$VL" run --batch --out-dir "$WORK/out" "$WORK"/case_*.vl --compiler "$SEED_WASM" \
    || { echo "BATCH RUNNER FAILED (vl run --batch)"; exit 2; }
fi

findings=0
known=0
declare -A seen=()
declare -A count=()
for f in "$WORK"/case_*.vl; do
  [ -f "$f" ] || continue
  b="$(basename "$f")"
  expected="$(cat "$f.log" 2>/dev/null)"
  shape="$(cat "$f.shape" 2>/dev/null)"
  err="$WORK/out/$b.err"
  why=""
  if [ -f "$err" ]; then
    if grep -q "type error\|parse error\|emit error" "$err"; then why="REJECT"
    elif grep -q "failed to compile\|failed to parse WebAssembly\|translation error\|Invalid input WebAssembly" "$err"; then why="INVALID-WASM"
    else why="TRAP"; fi
  else
    actual="$(cat "$WORK/out/$b.out" 2>/dev/null)"
    if [ "$actual" != "$expected" ]; then
      why="MISMATCH"
      err="$WORK/run.err"
      { echo "expected: [$expected]"; echo "actual:   [$actual]"; } > "$err"
    fi
  fi
  [ -n "$why" ] || continue

  # Record every failure (with its class) for the exact bidirectional check in
  # rep-fuzz-check.sh — written BEFORE baseline suppression so the record is complete.
  [ -n "$SHAPES_OUT" ] && printf '%s\t%s\n' "$why" "$shape" >> "$SHAPES_OUT"

  # A baselined failure is a KNOWN issue (any class — INVALID-WASM/TRAP/MISMATCH/REJECT), not
  # a NEW finding. Known issues are committed to the baseline and burned down over time; the
  # invariant the LOCAL pre-push gate enforces (via rep-fuzz-check.sh) is no regression — never a NEW or worse failure.
  # The baseline is class-tagged `CLASS<TAB>SHAPE`, so a shape getting WORSE (e.g. REJECT ->
  # INVALID-WASM) is a new line and surfaces as a finding.
  if [ -n "$BASELINE" ] && grep -qxF "$(printf '%s\t%s' "$why" "$shape")" "$BASELINE" 2>/dev/null; then
    known=$((known + 1))
    continue
  fi
  findings=$((findings + 1))
  count[$why]=$(( ${count[$why]:-0} + 1 ))
  if [ -n "$KEEP" ]; then
    base="$(basename "$f" .vl)"
    cp "$f" "$KEEP/$base.vl"
    cp "$err" "$KEEP/$base.err"
  fi
  if [ "$QUIET" -eq 0 ] && [ -z "${seen[$why]:-}" ]; then
    seen[$why]=1
    echo; echo "✗ $why  (repro: scripts/fuzz-vl.sh --seed $SEED --count $COUNT --depth $DEPTH)"
    echo "  ── case ──"; sed 's/^/  /' "$f"; echo "  ── error ──"; sed 's/^/  /' "$err"
  fi
  echo "✗ $why  $shape"
done

echo
summary=""
for k in "${!count[@]}"; do summary="$summary $k=${count[$k]}"; done
echo "done. $findings findings ($known known-baseline).${summary}"
[ "$findings" -eq 0 ] || exit 1
