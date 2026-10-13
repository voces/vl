#!/usr/bin/env bash
# The accuracy and determinism grid for std:math's exp, log, pow, atan, asin, acos, atan2 and hypot.
#
# Builds scripts/std-math/math-grid.vl at -O0 and -O3, runs both under wasmtime (`vl run`)
# and V8 (Deno), requires all four transcripts to agree bit for bit on every RESULT, then
# grades the -O0 transcript against mpmath (max/mean ulp per function, width and section).
# Needs mpmath (pip install mpmath); PYTHON picks an interpreter that has it.
#
#   scripts/std-math/math-check.sh [out-dir]
set -euo pipefail
cd "$(dirname "$0")/../.."
VL="${VL:-scripts/vl-host/target/release/vl}"
SEED="${SEED:-build/vl-compiler.wasm}"
PYTHON="${PYTHON:-python3}"
OUT="${1:-$(mktemp -d)}"
mkdir -p "$OUT"
export VL_STD="${VL_STD:-$PWD/std}"

timeout 300 "$VL" build scripts/std-math/math-grid.vl -o "$OUT/grid.wasm" --compiler "$SEED"
timeout 300 "$VL" build scripts/std-math/math-grid.vl -O3 -o "$OUT/grid-o3.wasm" --compiler "$SEED"
for m in grid grid-o3; do
  timeout 300 "$VL" run "$OUT/$m.wasm" > "$OUT/$m.wasmtime.txt"
  timeout 300 deno run -A scripts/std-math/run-v8.ts "$OUT/$m.wasm" "$OUT/$m.v8.txt"
done
# The inputs include `0.0 / 0.0`, whose sign is the engine's choice, so compare only the kind
# and the result (the last column).
results() { awk '{ print $1, $NF }' "$1"; }
for t in grid.v8 grid-o3.wasmtime grid-o3.v8; do
  if ! cmp -s <(results "$OUT/grid.wasmtime.txt") <(results "$OUT/$t.txt"); then
    echo "DETERMINISM FAILURE: grid.wasmtime and $t disagree on a result"
    exit 1
  fi
done
echo "determinism: $(wc -l < "$OUT/grid.wasmtime.txt") points, results identical across wasmtime/V8 x -O0/-O3"
"$PYTHON" scripts/std-math/math-grade.py "$OUT/grid.wasmtime.txt"
