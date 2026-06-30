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
fetched=0
if [ ! -f "$SEED" ]; then
  if [ "$FALLBACK" = 0 ]; then
    echo "missing seed: $SEED (run scripts/fetch-seed.sh)"; exit 1
  fi
  SEED="$SEED" scripts/fetch-seed.sh
  fetched=1
fi

# The compiler is built from REAL `import`/`export` modules: `compiler/entry.vl`
# re-exports the host ABI under bare names and the vl host's module fetch loop
# resolves the graph (entry → driver → the pipeline). No sed/cat/rename glue.
echo "== self-compile current compiler source with the seed =="
# A seed that cannot compile current source is too stale (the compiler started
# using a construct its emitter cannot lower). Fail LOUD — do not silently
# re-enter the TS stage-0 path. The fix is an explicit break-glass re-mint.
selfcompile() { "$VL" build compiler/entry.vl -o "$WORK/next.wasm" --compiler "$SEED"; }

ok=0
if selfcompile; then ok=1; fi
# STALE CACHED SEED: a WARM seed (a pre-existing build/vl-compiler.wasm, e.g. a CI
# cache restored by a prefix `restore-keys` match) can be arbitrarily stale — older
# than the rolling `seed-latest` that DOES compile current source. If the warm seed
# fails and we have not already fetched fresh this run, re-fetch `seed-latest`
# (republished on every master push) and retry the self-compile ONCE before failing
# loud. This makes the refresh robust to the CI seed-cache staleness race.
if [ "$ok" = 0 ] && [ "$FALLBACK" = 1 ] && [ "$fetched" = 0 ]; then
  echo "  seed cannot compile current source — may be a stale CACHED seed;" >&2
  echo "  re-fetching the rolling seed-latest and retrying once..." >&2
  # `fetch-seed.sh` no-ops when a seed file is already present, so remove the
  # stale one first to force a real download of the current `seed-latest`.
  rm -f "$SEED"
  SEED="$SEED" scripts/fetch-seed.sh
  fetched=1
  if selfcompile; then ok=1; fi
fi
if [ "$ok" = 0 ]; then
  echo "ERROR: seed cannot compile current source (stale seed)." >&2
  echo "  The seed predates a construct the compiler now uses, AND the rolling" >&2
  echo "  seed-latest could not compile it either. Land the enabling change in" >&2
  echo "  smaller steps so each seed self-compiles the next (there is no TS re-mint" >&2
  echo "  — the project keeps no second compiler)." >&2
  exit 1
fi

echo "== sanity: the refreshed compiler compiles + runs a program =="
printf 'print(6 * 7)\nprint(1 + 2)\n' > "$WORK/hello.vl"
out="$("$VL" run "$WORK/hello.vl" --compiler "$WORK/next.wasm")"
[ "$out" = "$(printf '42\n3')" ] || { echo "refreshed compiler misbehaves: $out"; exit 1; }

mkdir -p "$(dirname "$OUT")"
mv "$WORK/next.wasm" "$OUT"
echo "refreshed $OUT ($(wc -c < "$OUT") bytes) from current compiler/*.vl"
