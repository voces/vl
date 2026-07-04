#!/usr/bin/env bash
# VL-NATIVE rep-composition fuzzer — the orchestrator half. Runs `scripts/fuzzgen.vl` (the generator)
# through the native `vl`, splits its batch of self-describing `.vl` cases on `===CASE` markers, runs
# each through `vl run`, and asserts the output matches the case's own `// @log` directive. NO Deno —
# the native host compiles + runs; the generator + the oracle (the buried literal) are pure VL.
#
# USAGE: scripts/fuzz-vl.sh [--seed N] [--count M] [--depth D] [--keep DIR] [--baseline FILE]
#                           [--shapes-out FILE] [--quiet]
#   A mismatch / compile-fail / trap is a finding, printed with the failing case + the --seed to repro.
#   Classes: REJECT (parse/type/emit error — the fail-loudly long tail), INVALID-WASM (emitted bytes
#   fail validation — a soundness hole), TRAP (runtime error), MISMATCH (silent wrong result).
#   --keep DIR      copy every failing case (+ its error) into DIR for triage.
#   --baseline FILE suppress KNOWN clean rejects: a REJECT whose `// @shape` line appears in FILE is
#                   a documented unsupported shape, not a finding (exit 0). The baseline holds ONLY
#                   rejects — a soundness class (INVALID-WASM/TRAP/MISMATCH) is ALWAYS a finding and
#                   can never be masked by the baseline. A NEW reject shape is a coverage regression.
#                   (The exact bidirectional check — incl. STALE baseline entries — is rep-fuzz-check.sh.)
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
while [ $# -gt 0 ]; do
  case "$1" in
    --seed) SEED="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --depth) DEPTH="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    --baseline) BASELINE="$2"; shift 2 ;;
    --shapes-out) SHAPES_OUT="$2"; shift 2 ;;  # append `CLASS<TAB>SHAPE` per failure (for rep-fuzz-check.sh)
    --quiet) QUIET=1; shift ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

[ -f "$SEED_WASM" ] || { echo "no seed at $SEED_WASM — run scripts/refresh-compiler.sh"; exit 2; }
[ -z "$KEEP" ] || mkdir -p "$KEEP"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Inject seed + count into a copy of the generator, then run it to emit the batch.
sed -e "s/^let SEED = .*/let SEED = $SEED/" -e "s/^let COUNT = .*/let COUNT = $COUNT/" -e "s/^let MAXDEPTH = .*/let MAXDEPTH = $DEPTH/" \
  scripts/fuzzgen.vl > "$WORK/gen.vl"
if ! "$VL" run "$WORK/gen.vl" --compiler "$SEED_WASM" > "$WORK/batch.txt" 2>"$WORK/generr.txt"; then
  echo "GENERATOR FAILED to run:"; cat "$WORK/generr.txt"; exit 2
fi

# Split the batch into one file per case on the `===CASE` marker.
awk -v dir="$WORK" '
  /^===CASE/ { n++; file = sprintf("%s/case_%05d.vl", dir, n); next }
  n > 0 { print > file }
' "$WORK/batch.txt"

echo "fuzz-vl: seed $SEED, $(ls "$WORK"/case_*.vl 2>/dev/null | wc -l | tr -d ' ') cases"

findings=0
known=0
declare -A seen=()
declare -A count=()
for f in "$WORK"/case_*.vl; do
  [ -f "$f" ] || continue
  expected="$(sed -n 's|^// @log ||p' "$f")"
  shape="$(sed -n 's|^// @shape ||p' "$f")"
  why=""
  if ! actual="$("$VL" run "$f" --compiler "$SEED_WASM" 2>"$WORK/run.err")"; then
    if grep -q "type error\|parse error\|emit error" "$WORK/run.err"; then why="REJECT"
    elif grep -q "failed to compile\|failed to parse WebAssembly\|translation error\|Invalid input WebAssembly" "$WORK/run.err"; then why="INVALID-WASM"
    else why="TRAP"; fi
  elif [ "$actual" != "$expected" ]; then
    why="MISMATCH"
    { echo "expected: [$expected]"; echo "actual:   [$actual]"; } > "$WORK/run.err"
  fi
  [ -n "$why" ] || continue

  # Record every failure (with its class) for the exact bidirectional check in
  # rep-fuzz-check.sh — written BEFORE baseline suppression so the record is complete.
  [ -n "$SHAPES_OUT" ] && printf '%s\t%s\n' "$why" "$shape" >> "$SHAPES_OUT"

  # Only a clean REJECT (fail-loud, unsupported shape) may be baselined as a KNOWN
  # non-issue. A soundness class (INVALID-WASM / TRAP / MISMATCH) is ALWAYS a finding
  # — it can never be masked by the baseline, so a real bug can never hide there.
  if [ "$why" = "REJECT" ] && [ -n "$BASELINE" ] && grep -qxF "$shape" "$BASELINE" 2>/dev/null; then
    known=$((known + 1))
    continue
  fi
  findings=$((findings + 1))
  count[$why]=$(( ${count[$why]:-0} + 1 ))
  if [ -n "$KEEP" ]; then
    base="$(basename "$f" .vl)"
    cp "$f" "$KEEP/$base.vl"
    cp "$WORK/run.err" "$KEEP/$base.err"
  fi
  if [ "$QUIET" -eq 0 ] && [ -z "${seen[$why]:-}" ]; then
    seen[$why]=1
    echo; echo "✗ $why  (repro: scripts/fuzz-vl.sh --seed $SEED --count $COUNT --depth $DEPTH)"
    echo "  ── case ──"; sed 's/^/  /' "$f"; echo "  ── error ──"; sed 's/^/  /' "$WORK/run.err"
  fi
  echo "✗ $why  $shape"
done

echo
summary=""
for k in "${!count[@]}"; do summary="$summary $k=${count[$k]}"; done
echo "done. $findings findings ($known known-baseline).${summary}"
[ "$findings" -eq 0 ] || exit 1
