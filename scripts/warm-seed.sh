#!/usr/bin/env bash
# Warm the seed's `.cwasm` sidecars: one per ENGINE CONFIGURATION the host compiles the seed
# under, so no later `vl` re-JITs it and parallel workers never race to.
#
#   scripts/warm-seed.sh [--fuel | --fuel-only] [--stash <dir>] [<seed>]     default seed: build/vl-compiler.wasm
#
# Two tags unless `--fuel-only`: the null-collector compile (`$VL_COMPILE_GC=null`), and the copying seed
# engine that `vl build`/`vl run` and the `check`/`fmt`/`test` pump share. `--fuel` adds the two
# `$VL_FUEL=1` tags the cost rows compile under; `--fuel-only` warms just those two (for
# refresh-compiler.sh `--fuel-stash`). The self-compile's own tag (scripts/self-compile-gc.sh)
# is left to refresh-compiler.sh's sanity run, which compiles under it.
# `--stash <dir>` places every sidecar in <dir> beside the seed first, then places every
# sidecar this run created into <dir>, so a CI cache of <dir> carries them to the next job.
#
# A sidecar's tag includes the host CPU's features unless `$VL_ISA` pins a level, so one
# written on another machine (a CI cache restored on a different runner) can miss here and
# is rebuilt once, before any test starts. Concurrent because each publish is an atomic rename; NON-FATAL because a sidecar
# is a cache, so a failure costs one JIT later, never a wrong answer.
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
FUEL=0
STASH=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --fuel) FUEL=1; shift ;;
    --fuel-only) FUEL=2; shift ;;
    --stash) STASH="$2"; shift 2 ;;
    *) break ;;
  esac
done
SEED="${1:-build/vl-compiler.wasm}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
printf 'print(6 * 7)\n' > "$WORK/hello.vl"

# A hard link where the two paths share a filesystem, a copy where they do not.
place() { ln -f "$1" "$2/" 2>/dev/null || cp -f "$1" "$2/"; }
if [ -n "$STASH" ] && [ -d "$STASH" ]; then
  for f in "$STASH"/*.cwasm; do
    if [ -e "$f" ]; then place "$f" "$(dirname "$SEED")"; fi
  done
fi
before="$(ls "$SEED".*.cwasm 2>/dev/null || true)"

note() { echo "  note: could not warm the $1 sidecar — its first use re-JITs the seed" >&2; }
# Each warm names its whole configuration, so a `$VL_COMPILE_GC_HEAP` the caller exported
# (refresh-compiler.sh sources the self-compile's) cannot turn the default warm into another.
warm_null() {
  VL_COMPILE_GC=null VL_COMPILE_GC_HEAP= "$VL" run "$WORK/hello.vl" --compiler "$SEED" \
    > /dev/null 2>&1 || note "null-compile"
}
warm_copying() {
  VL_COMPILE_GC=copying VL_COMPILE_GC_HEAP= "$VL" build "$WORK/hello.vl" -o "$WORK/copying.wasm" \
    --compiler "$SEED" > /dev/null 2>&1 || note "copying-compile"
}
warm_fuel() {
  VL_FUEL=1 VL_COMPILE_GC="$1" VL_COMPILE_GC_HEAP= "$VL" build "$WORK/hello.vl" \
    -o "$WORK/fuel-$1.wasm" --compiler "$SEED" > /dev/null 2>&1 || note "fuel/$1"
}

if [ "$FUEL" != 2 ]; then warm_null & warm_copying & fi
if [ "$FUEL" != 0 ]; then warm_fuel copying & warm_fuel null & fi
wait

# Only a sidecar this run created goes into the stash, so a restored stash adds nothing to save.
if [ -n "$STASH" ]; then
  for f in "$SEED".*.cwasm; do
    [ -e "$f" ] || continue
    if printf '%s\n' "$before" | grep -qxF "$f"; then continue; fi
    mkdir -p "$STASH"
    place "$f" "$STASH"
    echo "stashed $(basename "$f") in $STASH"
  done
fi
