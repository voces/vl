#!/usr/bin/env bash
# COLD vs WARM: what a `vl` process pays to get the 1.8 MB seed executable.
# COLD = no `.cwasm` sidecar, so wasmtime Cranelift-compiles the seed; WARM =
# `Module::deserialize_file` of the 16 MB sidecar. The same program is compiled
# in both arms, so the difference is the seed, not the input.
#   scripts/perf/seed-jit-cost.sh [program.vl ...]
set -u
cd "$(dirname "$0")/../.."
export VL_STD="$PWD/std"
V=./scripts/vl-host/target/release/vl
T=$(mktemp -d "${TMPDIR:-/tmp}/b7z-jit.XXXXXX"); trap 'rm -rf "$T"' EXIT
printf 'print(1)\n' > "$T/tiny.vl"
PROGS=("$@"); [ ${#PROGS[@]} -gt 0 ] || PROGS=("$T/tiny.vl" std/json.vl compiler/lex.vl)
echo "load: $(uptime | sed 's/.*average/avg/')"
printf '%-22s %-8s %8s %8s %8s\n' program arm wall user sys
for p in "${PROGS[@]}"; do
  for arm in COLD WARM1 WARM2; do
    [ "$arm" = COLD ] && { rm -f "$T"/seed.wasm*; cp build/vl-compiler.wasm "$T/seed.wasm"; }
    /usr/bin/time -f "%e %U %S" -o "$T/t" "$V" check "$p" --compiler "$T/seed.wasm" >/dev/null 2>&1
    printf '%-22s %-8s %8s %8s %8s\n' "$(basename "$p")" "$arm" $(cat "$T/t")
  done
done
echo "load: $(uptime | sed 's/.*average/avg/')"
