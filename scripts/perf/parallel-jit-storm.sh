#!/usr/bin/env bash
# Does the ci-native step pay N CONCURRENT seed JITs at its start?
# `deno test --parallel` gives every test FILE its own worker and every case
# spawns `vl`; the `.cwasm` sidecar is published only when the first JIT
# finishes, so every worker that starts before that publish compiles the 1.8 MB
# seed itself. `refresh-compiler.sh` carries forward only the sidecar its own
# sanity `vl run` made, so the `vl check` engine tag is cold at step start —
# which is the `post-refresh` arm here. `warm` pre-creates both tags.
#   scripts/perf/parallel-jit-storm.sh <outdir>
set -u
cd "$(dirname "$0")/../.."
OUT="${1:?usage: parallel-jit-storm.sh <outdir>}"; mkdir -p "$OUT"
export VL_STD="$PWD/std" SELFHOST_NATIVE_ALIGN=1
V=./scripts/vl-host/target/release/vl
T="$OUT/w"; mkdir -p "$T"; printf 'print(1)\n' > "$T/tiny.vl"
arm() { local n="$1"
  ls build/*.cwasm 2>/dev/null | sed "s|.*/|$n sidecar: |"
  /usr/bin/time -f "$n\twall=%e\tuser=%U\tsys=%S" -o "$OUT/$n.time" \
    deno test -A --no-check --parallel tests/selfhost_native_*_test.ts tests/vl_*_test.ts \
    > "$OUT/$n.log" 2>&1
  printf '%s\tload %s\n' "$(cat "$OUT/$n.time")" "$(uptime | sed 's/.*average: //')"; }
reset_post_refresh() { rm -f build/vl-compiler.wasm.*.cwasm
  "$V" run "$T/tiny.vl" --compiler build/vl-compiler.wasm >/dev/null 2>&1; }
reset_warm() { "$V" check "$T/tiny.vl" --compiler build/vl-compiler.wasm >/dev/null 2>&1; }
reset_post_refresh;            arm post-refresh
reset_warm;                    arm warm
reset_post_refresh;            arm post-refresh2
reset_warm;                    arm warm2
