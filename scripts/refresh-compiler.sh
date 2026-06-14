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
# later. (A stale seed silently tests an outdated compiler: `vl check`/`vl run`
# behavior reflects the seed's pinned source, not the current compiler/*.vl.)
#
# MISSING-SEED FALLBACK: with no seed present, this fetches the rolling
# `seed-latest` release (scripts/fetch-seed.sh) and falls THROUGH to the
# self-compile step. The fetched seed may be one master push stale — fine: it
# need only be new enough to compile current source, and native-fixpoint.sh
# re-proves the refreshed result. TS is NOT on this path; it is reachable only
# via the explicit `scripts/fetch-seed.sh --ts-genesis` break-glass.
#
# STALE-SEED FAILURE: a seed (cached or fetched) that predates a language
# construct newly used BY THE COMPILER ITSELF cannot compile current source (e.g.
# "unsupported statement in body" after the compiler starts using a feature only
# newer emitters lower). That is a LOUD failure pointing at --ts-genesis, never a
# silent TS re-entry. (Pass --no-fallback to fail on a missing seed too, e.g. in
# an environment with no network.)
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

[ -x "$VL" ] || { echo "missing vl binary: $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
# Missing seed: fetch the rolling `seed-latest` release, then fall through to the
# self-compile below — the fetched seed need only compile current source. The TS
# stage-0 path is gone from here; fetch-seed.sh routes air-gapped/genesis cases
# through its own --ts-genesis break-glass.
if [ ! -f "$SEED" ]; then
  if [ "$FALLBACK" = 0 ]; then
    echo "missing seed: $SEED (scripts/fetch-seed.sh, or --ts-genesis offline)"; exit 1
  fi
  SEED="$SEED" scripts/fetch-seed.sh
fi

# The compiler's own source + the single-sourced driver — the same sed/cat
# assembly as native-fixpoint.sh (lexer Tok/Diag/advance de-collision rename).
sed -E 's/\bTok\b/LexTok/g; s/\bDiag\b/LexDiag/g; s/\badvance\b/lexAdvance/g' \
  compiler/lexer.vl > "$WORK/vlsrc.vl"
cat compiler/ast.vl compiler/parser.vl compiler/typecheck.vl compiler/wasmEmit.vl compiler/lint.vl \
  scripts/vl-compiler-driver.vl >> "$WORK/vlsrc.vl"
# BLANK the compiler's own import statements (range-aware; multi-line imports) —
# see native-fixpoint.sh: a line-leading `import {` would trip the vl binary's
# module gate. Blanking preserves line numbers; byte-identical output.
sed -i -E '/^import \{/,/\} from "/ s/.*//' "$WORK/vlsrc.vl"

echo "== self-compile current compiler source with the seed =="
# A seed that cannot compile current source is too stale (the compiler started
# using a construct its emitter cannot lower). Fail LOUD — do not silently
# re-enter the TS stage-0 path. The fix is an explicit break-glass re-mint.
if ! "$VL" build "$WORK/vlsrc.vl" -o "$WORK/next.wasm" --compiler "$SEED"; then
  echo "ERROR: seed cannot compile current source (stale seed)." >&2
  echo "  The published seed-latest predates a construct the compiler now uses." >&2
  echo "  Break-glass: scripts/fetch-seed.sh --ts-genesis  (re-mint from source; needs deno)." >&2
  exit 1
fi

echo "== sanity: the refreshed compiler compiles + runs a program =="
printf 'print(6 * 7)\nprint(1 + 2)\n' > "$WORK/hello.vl"
out="$("$VL" run "$WORK/hello.vl" --compiler "$WORK/next.wasm")"
[ "$out" = "$(printf '42\n3')" ] || { echo "refreshed compiler misbehaves: $out"; exit 1; }

mkdir -p "$(dirname "$OUT")"
mv "$WORK/next.wasm" "$OUT"
echo "refreshed $OUT ($(wc -c < "$OUT") bytes) from current compiler/*.vl"
