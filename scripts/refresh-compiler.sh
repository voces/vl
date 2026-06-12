#!/usr/bin/env bash
# FAST seed refresh — rebuild `build/vl-compiler.wasm` from the CURRENT
# compiler/*.vl source by SELF-COMPILING with the existing healthy seed (~3s),
# instead of the TS stage-0 path (`deno run -A scripts/build-compiler-wasm.ts`,
# ~80s). The result is byte-identical to a TS-built seed — that equivalence is
# exactly what the SELFHOST_FULL_FIXPOINT / native-fixpoint gates prove — so the
# refreshed seed is a drop-in for every consumer (`vl … --compiler`, the native
# test suites, native-fixpoint.sh).
#
# Iteration loop this enables: edit compiler/*.vl → `scripts/refresh-compiler.sh`
# → `vl check/run/build` against the refreshed seed reflects the edit, seconds
# later. (Without this, a stale seed silently tests YESTERDAY'S checker — e.g.
# `vl check` kept printing a pre-Slice-5 diagnostic until the seed was rebuilt.)
#
# STALE-SEED FALLBACK: a seed that predates a language construct newly used BY
# THE COMPILER ITSELF cannot compile current source (e.g. "unsupported statement
# in body" after the compiler starts using a feature only newer emitters lower).
# In that one case the TS stage-0 bootstrap is the only way to mint a seed, so
# this script falls back to it automatically (pass --no-fallback to fail instead,
# e.g. in environments without deno).
#
# The new seed replaces build/vl-compiler.wasm ATOMICALLY (temp + mv) and only
# after a sanity run, so an interrupted/broken build never clobbers a good seed.
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
SEED="${SEED:-build/vl-compiler.wasm}"
OUT="${OUT:-build/vl-compiler.wasm}"
FALLBACK=1
[ "${1:-}" = "--no-fallback" ] && FALLBACK=0

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ts_bootstrap() {
  echo "== falling back to the TS stage-0 bootstrap (slow path) =="
  deno run -A scripts/build-compiler-wasm.ts
  echo "refreshed $OUT via TS bootstrap"
}

[ -x "$VL" ] || { echo "missing vl binary: $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
if [ ! -f "$SEED" ]; then
  if [ "$FALLBACK" = 1 ]; then ts_bootstrap; exit 0; fi
  echo "missing seed: $SEED (deno run -A scripts/build-compiler-wasm.ts)"; exit 1
fi

# The compiler's own source + the single-sourced driver — the same sed/cat
# assembly as native-fixpoint.sh (lexer Tok/Diag/advance de-collision rename).
sed -E 's/\bTok\b/LexTok/g; s/\bDiag\b/LexDiag/g; s/\badvance\b/lexAdvance/g' \
  compiler/lexer.vl > "$WORK/vlsrc.vl"
cat compiler/ast.vl compiler/parser.vl compiler/typecheck.vl compiler/wasmEmit.vl \
  scripts/vl-compiler-driver.vl >> "$WORK/vlsrc.vl"
# BLANK the compiler's own import statements (range-aware; multi-line imports) —
# see native-fixpoint.sh: a line-leading `import {` would trip the vl binary's
# module gate (H3). Blanking preserves line numbers; byte-identical output.
sed -i -E '/^import \{/,/\} from "/ s/.*//' "$WORK/vlsrc.vl"

echo "== self-compile current compiler source with the seed =="
if ! "$VL" build "$WORK/vlsrc.vl" -o "$WORK/next.wasm" --compiler "$SEED"; then
  if [ "$FALLBACK" = 1 ]; then
    echo "seed cannot compile current source (stale seed)"
    ts_bootstrap; exit 0
  fi
  echo "seed cannot compile current source (stale seed); re-run without --no-fallback or: deno run -A scripts/build-compiler-wasm.ts"
  exit 1
fi

echo "== sanity: the refreshed compiler compiles + runs a program =="
printf 'print(6 * 7)\nprint(1 + 2)\n' > "$WORK/hello.vl"
out="$("$VL" run "$WORK/hello.vl" --compiler "$WORK/next.wasm")"
[ "$out" = "$(printf '42\n3')" ] || { echo "refreshed compiler misbehaves: $out"; exit 1; }

mkdir -p "$(dirname "$OUT")"
mv "$WORK/next.wasm" "$OUT"
echo "refreshed $OUT ($(wc -c < "$OUT") bytes) from current compiler/*.vl"
