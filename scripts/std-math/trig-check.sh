#!/usr/bin/env bash
# The accuracy and determinism grid for std:math's sinF64/cosF64/sinF32/cosF32.
#
# Builds scripts/std-math/trig-grid.vl at -O0 and -O3, runs both under wasmtime (`vl run`)
# and V8 (Deno), requires all four transcripts to agree bit for bit on every RESULT, then
# grades the -O0 transcript against mpmath (max/mean ulp per width, function and range).
# Needs `python3 -c 'import mpmath'` (pip install mpmath). ~1 min with the box to itself.
#
#   scripts/std-math/trig-check.sh [out-dir]
set -euo pipefail
cd "$(dirname "$0")/../.."
VL="${VL:-scripts/vl-host/target/release/vl}"
SEED="${SEED:-build/vl-compiler.wasm}"
OUT="${1:-$(mktemp -d)}"
mkdir -p "$OUT"
export VL_STD="${VL_STD:-$PWD/std}"

timeout 300 "$VL" build scripts/std-math/trig-grid.vl -o "$OUT/grid.wasm" --compiler "$SEED"
timeout 300 "$VL" build scripts/std-math/trig-grid.vl -O3 -o "$OUT/grid-o3.wasm" --compiler "$SEED"
for m in grid grid-o3; do
  timeout 300 "$VL" run "$OUT/$m.wasm" > "$OUT/$m.wasmtime.txt"
  timeout 300 deno run -A scripts/std-math/run-v8.ts "$OUT/$m.wasm" "$OUT/$m.v8.txt"
done
# Column 1 is the input: the grid makes two of its NaN inputs with `0.0 / 0.0`, whose sign is
# the engine's or the optimiser's choice. Columns 2-3 are the results and must all agree.
for t in grid.v8 grid-o3.wasmtime grid-o3.v8; do
  if ! cmp -s <(cut -d' ' -f1,3,4 "$OUT/grid.wasmtime.txt") <(cut -d' ' -f1,3,4 "$OUT/$t.txt"); then
    echo "DETERMINISM FAILURE: grid.wasmtime and $t disagree on a result"
    exit 1
  fi
done
echo "determinism: $(wc -l < "$OUT/grid.wasmtime.txt") points, results identical across wasmtime/V8 x -O0/-O3"
python3 scripts/std-math/trig-grade.py "$OUT/grid.wasmtime.txt"
