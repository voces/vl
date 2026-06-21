#!/usr/bin/env bash
# FAST seed refresh — rebuild `build/vl-compiler.wasm` from the CURRENT
# compiler/*.vl source by SELF-COMPILING with the existing healthy seed (~3s).
# The native-fixpoint gate (stage3 == stage4) proves the refreshed seed is a
# faithful fixed point, so it is a drop-in for every consumer (`vl … --compiler`,
# the native test suites, native-fixpoint.sh).
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
# re-proves the refreshed result. (Pass --no-fallback to fail on a missing seed
# too, e.g. in an environment with no network.)
#
# STALE-SEED FAILURE: a seed (cached or fetched) that predates a language
# construct newly used BY THE COMPILER ITSELF cannot compile current source (e.g.
# "unsupported statement in body" after the compiler starts using a feature only
# newer emitters lower). That is a LOUD failure — the fix is to re-fetch
# `seed-latest` (republished on every master push, so it tracks current master).
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
# self-compile below — the fetched seed need only compile current source.
if [ ! -f "$SEED" ]; then
  if [ "$FALLBACK" = 0 ]; then
    echo "missing seed: $SEED (run scripts/fetch-seed.sh)"; exit 1
  fi
  SEED="$SEED" scripts/fetch-seed.sh
fi

# The compiler is built from REAL `import`/`export` modules: `compiler/entry.vl`
# re-exports the host ABI under bare names and the vl host's module fetch loop
# resolves the graph (entry → driver → the pipeline). No sed/cat/rename glue.
echo "== self-compile current compiler source with the seed =="
# A seed that cannot compile current source is too stale (the compiler started
# using a construct its emitter cannot lower). Fail LOUD — do not silently
# re-enter the TS stage-0 path. The fix is an explicit break-glass re-mint.
if ! "$VL" build compiler/entry.vl -o "$WORK/next.wasm" --compiler "$SEED"; then
  echo "ERROR: seed cannot compile current source (stale seed)." >&2
  echo "  The seed predates a construct the compiler now uses. Re-fetch the" >&2
  echo "  rolling seed-latest (scripts/fetch-seed.sh); if seed-latest ITSELF is too" >&2
  echo "  old, land the enabling change in smaller steps so each seed self-compiles" >&2
  echo "  the next (there is no TS re-mint — the project keeps no second compiler)." >&2
  exit 1
fi

echo "== sanity: the refreshed compiler compiles + runs a program =="
printf 'print(6 * 7)\nprint(1 + 2)\n' > "$WORK/hello.vl"
out="$("$VL" run "$WORK/hello.vl" --compiler "$WORK/next.wasm")"
[ "$out" = "$(printf '42\n3')" ] || { echo "refreshed compiler misbehaves: $out"; exit 1; }

mkdir -p "$(dirname "$OUT")"
mv "$WORK/next.wasm" "$OUT"
echo "refreshed $OUT ($(wc -c < "$OUT") bytes) from current compiler/*.vl"
