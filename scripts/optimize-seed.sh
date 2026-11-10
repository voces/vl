#!/usr/bin/env bash
# Write the PUBLISHED form of a proven seed: binaryen 130 `-O` with inlining off.
#
#   scripts/optimize-seed.sh [<fixpoint>] [<out>]    # defaults build/vl-compiler.wasm, build/publish/vl-compiler.wasm
#
# <fixpoint> must already be proven (refresh-compiler.sh --prove-fixpoint, native-fixpoint.sh).
# The output ships only when it compiles compiler/entry.vl back to <fixpoint> byte for byte, so
# it is a drop-in seed whose first self-compile lands on the same fixpoint. Inlining stays off
# because an inlined seed needs about twice the V8 stack, which the playground runs it under.
# Only the published asset takes this step; the refresh, the CI cache and the ratchets keep the
# unoptimized fixpoint (DECISIONS.md §"The published seed is binaryen `-O` without inlining").
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
. scripts/self-compile-gc.sh
IN="${1:-build/vl-compiler.wasm}"
OUT="${2:-build/publish/vl-compiler.wasm}"
[ -x "$VL" ] || { echo "missing vl binary: $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
[ -s "$IN" ] || { echo "missing fixpoint seed: $IN (scripts/refresh-compiler.sh --prove-fixpoint)"; exit 1; }

# Native binaryen at the version package.json pins; npm's JS build writes the same bytes ~7x slower.
OPT="${VL_WASM_OPT:-}"
if [ -z "$OPT" ]; then
  if d="$(scripts/fetch-binaryen.sh)"; then
    OPT="$d/wasm-opt"
  elif [ -x node_modules/.bin/wasm-opt ]; then
    OPT=node_modules/.bin/wasm-opt
  else
    echo "optimize-seed: no wasm-opt (scripts/fetch-binaryen.sh failed and no node_modules)" >&2
    exit 1
  fi
fi
"$OPT" --version | grep -q "version 130 " || {
  echo "optimize-seed: $OPT is not binaryen 130 (package.json pins it)" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The feature list is the host's BINARYEN_FEATURES (scripts/vl-host/src/main.rs); a feature the
# emitter starts using without it here fails validation loudly, never silently.
echo "== wasm-opt -O, inlining off ($("$OPT" --version)) =="
BINARYEN_CORES="${BINARYEN_CORES:-4}" "$OPT" "$IN" '--no-inline=*' -O \
  --enable-reference-types --enable-gc --enable-bulk-memory --enable-tail-call --enable-simd \
  --enable-threads --enable-nontrapping-float-to-int --enable-multivalue \
  -o "$WORK/opt.wasm"
echo "== the optimized seed compiles the compiler back to the fixpoint =="
"$VL" build compiler/entry.vl -o "$WORK/back.wasm" --compiler "$WORK/opt.wasm"
if ! cmp "$WORK/back.wasm" "$IN"; then
  echo "ERROR: compile(optimized seed) != the fixpoint — wasm-opt changed what the compiler emits." >&2
  exit 1
fi
printf 'print(6 * 7)\n' > "$WORK/hello.vl"
out="$("$VL" run "$WORK/hello.vl" --compiler "$WORK/opt.wasm")"
[ "$out" = 42 ] || { echo "ERROR: the optimized seed prints '$out' for 6 * 7" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"
cp "$WORK/opt.wasm" "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
echo "optimized $IN ($(wc -c < "$IN") bytes) -> $OUT ($(wc -c < "$OUT") bytes); compile($OUT) == $IN"
