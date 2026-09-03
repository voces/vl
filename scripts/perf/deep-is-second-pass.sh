#!/usr/bin/env bash
# PART C: what the deep-`is` SECOND PASS costs (#2406). `jwSecondPass`
# (compiler/driver.vl:660) returns at once when no deep `is` exists, and
# otherwise generates walker source, re-tokenizes, re-parses and runs
# `checkProgram` over the WHOLE program a second time. So the price is a
# doubled typecheck, charged to any file containing one — including in the LSP,
# which drives the same `checkSrc`.
# A/B: the same file with and without one deep `is`, N lines of scenery.
#   scripts/perf/deep-is-second-pass.sh [lines]
set -u
cd "$(dirname "$0")/../.."
export VL_STD="$PWD/std"
V=./scripts/vl-host/target/release/vl
N="${1:-400}"
T=$(mktemp -d "${TMPDIR:-/tmp}/b7z-deepis.XXXXXX"); trap 'rm -rf "$T"' EXIT
scenery() { local i=0; while [ "$i" -lt "$N" ]; do
    echo "function f$i(a: i32, b: i32): i32 { const c = a + b; c * 2 }"; i=$((i+1)); done; }
HDR='type Json = null | boolean | f64 | string | Json[] | { [string]: Json }'
{ echo "$HDR"; echo 'type Cfg = { port: i32 }'; scenery
  echo 'const r: Json = null'
  echo 'if r == null { print(0) } else { print(1) }'; } > "$T/without.vl"
{ echo "$HDR"; echo 'type Cfg = { port: i32 }'; scenery
  echo 'const r: Json = null'
  echo 'if r is Cfg { print(r.port) } else { print(0) }'; } > "$T/with.vl"
echo "load: $(uptime | sed 's/.*average/avg/')   scenery lines: $N"
for f in without with; do
  best=999
  for _ in 1 2 3 4 5; do
    s=$(date +%s.%N); "$V" check "$T/$f.vl" --compiler build/vl-compiler.wasm >/dev/null 2>&1
    e=$(date +%s.%N); best=$(echo "$e - $s; $best" | bc | sort -g | head -1)
  done
  printf '%-10s best %7.3f s\n' "$f" "$best"
done
echo "load: $(uptime | sed 's/.*average/avg/')"
