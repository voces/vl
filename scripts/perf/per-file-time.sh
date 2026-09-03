#!/usr/bin/env bash
# Per-FILE cost of the ci-native suites, one `deno test` process at a time.
# SERIAL on purpose: under `--parallel` on a shared box a 200 ms case reports 25 s
# of wall, so the parallel log cannot attribute anything. Here each file gets its
# own process and its own user CPU, which contention does not inflate.
#   scripts/perf/per-file-time.sh <outdir> [glob...]
set -u
cd "$(dirname "$0")/../.."
OUT="${1:?usage: per-file-time.sh <outdir> [files...]}"; shift; mkdir -p "$OUT"
export VL_STD="${VL_STD:-$PWD/std}" SELFHOST_NATIVE_ALIGN=1
FILES=("$@")
[ ${#FILES[@]} -gt 0 ] || FILES=(tests/selfhost_native_*_test.ts tests/vl_*_test.ts)
uptime > "$OUT/load.txt"
: > "$OUT/files.tsv"
for f in "${FILES[@]}"; do
  b=$(basename "$f" .ts)
  /usr/bin/time -f "$f\t%e\t%U\t%S" -o "$OUT/$b.t" \
    deno test -A --no-check "$f" > "$OUT/$b.log" 2>&1
  printf '%s\trc=%s\n' "$(cat "$OUT/$b.t" | tail -1)" "$?" >> "$OUT/files.tsv"
done
uptime >> "$OUT/load.txt"
sort -t"$(printf '\t')" -k3 -rn "$OUT/files.tsv" | head -30
