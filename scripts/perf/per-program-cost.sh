#!/usr/bin/env bash
# Per-PROGRAM cost of the compiler, in lines and in host phases. Three sizes and
# three std footprints, each timed 3x and phase-attributed with `$VL_PROFILE`.
# The point of the matrix is the ms/LINE column: a program that imports std pays
# for std's lines too, and this is what shows it.
#   scripts/perf/per-program-cost.sh [reps]
set -u
cd "$(dirname "$0")/../.."
export VL_STD="$PWD/std"
V=./scripts/vl-host/target/release/vl
REPS="${1:-3}"
T=$(mktemp -d "${TMPDIR:-/tmp}/b7z-prog.XXXXXX"); trap 'rm -rf "$T"' EXIT
printf 'print(1)\n' > "$T/tiny.vl"
printf 'import { expect } from "std:test"\nexpect(1).toBe(1)\n' > "$T/imp-test.vl"
printf 'import { fmt } from "std:fmt"\nprint(fmt("{}", [1]))\n' > "$T/imp-fmt.vl"
printf 'import { parseJson } from "std:json"\nprint(parseJson("1") != null)\n' > "$T/imp-json.vl"
echo "load: $(uptime | sed 's/.*average/avg/')"
row() { # name file lines
  local n="$1" f="$2" ln="$3" best=999
  for _ in $(seq "$REPS"); do
    local s e
    s=$(date +%s.%N); "$V" check "$f" --compiler build/vl-compiler.wasm >/dev/null 2>&1
    e=$(date +%s.%N)
    best=$(echo "$e - $s; $best" | bc | sort -g | head -1)
  done
  printf '%-14s %5s lines  best %6.3f s  %7.2f ms/line\n' \
    "$n" "$ln" "$best" "$(echo "$best * 1000 / $ln" | bc -l)"
}
row tiny        "$T/tiny.vl"     1
row imports-test "$T/imp-test.vl" 2
row imports-fmt  "$T/imp-fmt.vl"  2
row imports-json "$T/imp-json.vl" 2
for m in std/json.vl std/fmt.vl std/array.vl std/test.vl std/str.vl; do
  row "$(basename "$m")" "$m" "$(wc -l < "$m")"
done
echo "--- host phases (VL_PROFILE=1), vl check std/json.vl"
VL_PROFILE=1 "$V" check std/json.vl --compiler build/vl-compiler.wasm 2>&1 | grep profile
echo "load: $(uptime | sed 's/.*average/avg/')"
