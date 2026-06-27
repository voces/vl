#!/usr/bin/env bash
# VL-NATIVE rep-composition fuzzer — the orchestrator half. Runs `scripts/fuzzgen.vl` (the generator)
# through the native `vl`, splits its batch of self-describing `.vl` cases on `===CASE` markers, runs
# each through `vl run`, and asserts the output matches the case's own `// @log` directive. NO Deno —
# the native host compiles + runs; the generator + the oracle (the buried literal) are pure VL.
#
# USAGE: scripts/fuzz-vl.sh [--seed N] [--count M]
#   A mismatch / compile-fail / trap is a finding, printed with the failing case + the --seed to repro.
# Requires a fresh seed: bash scripts/refresh-compiler.sh
set -uo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
SEED_WASM="${SEED_WASM:-build/vl-compiler.wasm}"
SEED=$((RANDOM * RANDOM))
COUNT=200
DEPTH=4
while [ $# -gt 0 ]; do
  case "$1" in
    --seed) SEED="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --depth) DEPTH="$2"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

[ -f "$SEED_WASM" ] || { echo "no seed at $SEED_WASM — run scripts/refresh-compiler.sh"; exit 2; }

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
seen_compile=0; seen_trap=0; seen_mismatch=0
for f in "$WORK"/case_*.vl; do
  [ -f "$f" ] || continue
  expected="$(sed -n 's|^// @log ||p' "$f")"
  if ! actual="$("$VL" run "$f" --compiler "$SEED_WASM" 2>"$WORK/run.err")"; then
    findings=$((findings + 1))
    if grep -q "type error\|parse error" "$WORK/run.err"; then why="COMPILE"; else why="TRAP"; fi
    if { [ "$why" = COMPILE ] && [ $seen_compile -eq 0 ]; } || { [ "$why" = TRAP ] && [ $seen_trap -eq 0 ]; }; then
      [ "$why" = COMPILE ] && seen_compile=1 || seen_trap=1
      echo; echo "✗ $why  (repro: scripts/fuzz-vl.sh --seed $SEED --count $COUNT)"
      echo "  ── case ──"; sed 's/^/  /' "$f"; echo "  ── error ──"; sed 's/^/  /' "$WORK/run.err"
    fi
    continue
  fi
  if [ "$actual" != "$expected" ]; then
    findings=$((findings + 1))
    if [ $seen_mismatch -eq 0 ]; then
      seen_mismatch=1
      echo; echo "✗ OUTPUT-MISMATCH  (repro: scripts/fuzz-vl.sh --seed $SEED --count $COUNT)"
      echo "  ── case ──"; sed 's/^/  /' "$f"
      echo "  expected: [$expected]"; echo "  actual:   [$actual]"
    fi
  fi
done

echo
echo "done. $findings findings."
[ "$findings" -eq 0 ] || exit 1
