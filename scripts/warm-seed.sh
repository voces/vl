#!/usr/bin/env bash
# Warm the seed's `.cwasm` sidecars: one per ENGINE CONFIGURATION the host compiles the seed
# under, so no later `vl` re-JITs it and parallel workers never race to.
#
#   scripts/warm-seed.sh [--fuel] [<seed>]     default seed: build/vl-compiler.wasm
#
# Three tags always: the null-collector compile (refresh-compiler.sh's pin), the
# collecting `check`/`fmt`/`test` pump, and the copying compile every `vl build`/`vl run`
# gets by default. `--fuel` adds the two `$VL_FUEL=1` tags the cost rows compile under.
#
# A sidecar's tag includes the host CPU's features unless `$VL_ISA` pins a level, so one
# written on another machine (a CI cache restored on a different runner) can miss here and
# is rebuilt once, before any test starts. Concurrent because each publish is an atomic rename; NON-FATAL because a sidecar
# is a cache, so a failure costs one JIT later, never a wrong answer.
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
FUEL=0
if [ "${1:-}" = --fuel ]; then FUEL=1; shift; fi
SEED="${1:-build/vl-compiler.wasm}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
printf 'print(6 * 7)\n' > "$WORK/hello.vl"

note() { echo "  note: could not warm the $1 sidecar — its first use re-JITs the seed" >&2; }
warm_null() {
  VL_COMPILE_GC=null "$VL" run "$WORK/hello.vl" --compiler "$SEED" > /dev/null 2>&1 || note "null-compile"
}
warm_check() {
  "$VL" check "$WORK/hello.vl" --compiler "$SEED" > /dev/null 2>&1 || note "check"
}
warm_copying() {
  VL_COMPILE_GC=copying "$VL" build "$WORK/hello.vl" -o "$WORK/copying.wasm" \
    --compiler "$SEED" > /dev/null 2>&1 || note "copying-compile"
}
warm_fuel() {
  VL_FUEL=1 VL_COMPILE_GC="$1" "$VL" build "$WORK/hello.vl" -o "$WORK/fuel-$1.wasm" \
    --compiler "$SEED" > /dev/null 2>&1 || note "fuel/$1"
}

warm_null & warm_check & warm_copying &
if [ "$FUEL" = 1 ]; then warm_fuel copying & warm_fuel null & fi
wait
