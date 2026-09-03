#!/usr/bin/env bash
# The FIXED cost of one `vl` process: argv-only (no seed), a warm `.cwasm`
# deserialize, and a cold JIT of the 1.8 MB seed. Every ci-native test case
# spawns at least one of these, so this is the job's per-case floor.
#   scripts/perf/vl-fixed-cost.sh [reps]
set -u
cd "$(dirname "$0")/../.."
export VL_STD="$PWD/std"
V=./scripts/vl-host/target/release/vl
REPS="${1:-5}"
T=$(mktemp -d "${TMPDIR:-/tmp}/b7z-fixed.XXXXXX"); trap 'rm -rf "$T"' EXIT
printf "print(1)\n" > "$T/tiny.vl"
echo "load: $(uptime | sed 's/.*average/avg/')"
run() { local n="$1"; shift
  for _ in $(seq "$REPS"); do
    /usr/bin/time -f "$n wall=%e user=%U sys=%S" -o "$T/t" "$@" >/dev/null 2>&1
    cat "$T/t"
  done; }
run "argv-only(--help)"   "$V" --help
run "check-tiny(warm)"    "$V" check "$T/tiny.vl" --compiler build/vl-compiler.wasm
run "run-tiny(warm)"      "$V" run   "$T/tiny.vl" --compiler build/vl-compiler.wasm
# COLD: a private copy of the seed has no sidecar, so the seed is JITed from wasm.
cp build/vl-compiler.wasm "$T/seed.wasm"
run "check-tiny(COLD jit)" "$V" check "$T/tiny.vl" --compiler "$T/seed.wasm"
run "check-tiny(2nd,warm)" "$V" check "$T/tiny.vl" --compiler "$T/seed.wasm"
echo "load: $(uptime | sed 's/.*average/avg/')"
