#!/usr/bin/env bash
# Time the ci-native JOB exactly as ci.yml runs it, in its three deno steps, and
# keep each step's raw output for per-test parsing. Reports user+sys CPU beside
# wall: the box is shared, so wall is noise and CPU is the workload.
#   scripts/perf/ci-native-time.sh <outdir>
set -u
cd "$(dirname "$0")/../.."
OUT="${1:?usage: ci-native-time.sh <outdir>}"; mkdir -p "$OUT"
export VL_STD="${VL_STD:-$PWD/std}"
LSP=$(awk '/Editor features on the wasm compiler/{f=1; next} f && /- name:/{exit} f{print}' \
        .github/workflows/ci.yml | grep -oE "tests/[a-zA-Z0-9_]+\.ts" | sort -u | tr '\n' ' ')
[ -n "$LSP" ] || { echo "no lsp list extracted" >&2; exit 1; }
uptime > "$OUT/load.txt"
step() { local n="$1"; shift
  /usr/bin/time -f "$n\twall=%e\tuser=%U\tsys=%S\tmaxrss=%MK" -o "$OUT/$n.time" \
    "$@" > "$OUT/$n.log" 2>&1; echo "$n rc=$?" >> "$OUT/rc.txt"; }
step native env SELFHOST_NATIVE_ALIGN=1 bash -c \
  'deno test -A --no-check --parallel tests/selfhost_native_*_test.ts tests/vl_*_test.ts'
step oracle deno test -A tests/cases_wasm_test.ts
step editor bash -c "deno test -A --no-check $LSP"
uptime >> "$OUT/load.txt"
cat "$OUT"/*.time
