#!/usr/bin/env bash
# Section sizes of the seed, and its growth over the last N days of master.
# The seed is JIT/deserialize input for every `vl` process in ci-native, so its
# size is a per-process cost, not just a download.
#   scripts/perf/seed-sections.sh [seed.wasm]
set -u
cd "$(dirname "$0")/../.."
SEED="${1:-build/vl-compiler.wasm}"
VL="${VL:-scripts/vl-host/target/release/vl}"
DIS=./node_modules/.bin/wasm-dis
echo "seed: $SEED  $(wc -c < "$SEED") bytes"
"$VL" run scripts/perf/seed-sections.vl -- "$SEED"
echo "--- function count / type count"
"$DIS" "$SEED" 2>/dev/null | grep -c "^ (func " || true
