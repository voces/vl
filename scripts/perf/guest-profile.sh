#!/usr/bin/env bash
# Guest-profile one command and rank by SELF time. Builds a `--names` seed once
# (frames read `wasm-function[N]` without one) and reuses it. `<cmd>` is any entry
# the host drives — check, build, run, fmt, test. The FIRST profiled run against a
# given seed re-JITs it (the epoch-instrumented engine has its own `.cwasm`
# sidecar); every later one deserializes, so read the ranking off a warm run.
#   scripts/perf/guest-profile.sh <out-dir> <cmd> <file> [more files...]
set -u
cd "$(dirname "$0")/../.."
export VL_STD="$PWD/std"
V=./scripts/vl-host/target/release/vl
OUT="${1:?usage: guest-profile.sh <outdir> <check|build> <file>...}"; shift
CMD="${1:?}"; shift
mkdir -p "$OUT"
NAMES="$OUT/names.wasm"
[ -f "$NAMES" ] || { echo "== building the --names seed"
  timeout 300 "$V" build compiler/entry.vl -o "$NAMES" --names \
    --compiler build/vl-compiler.wasm || exit 1; }
for f in "$@"; do
  b=$(basename "$f" .vl)
  echo "== $CMD $f   load: $(uptime | sed 's/.*average/avg/')"
  VL_PROFILE_GUEST="$OUT/$b.json" "$V" "$CMD" "$f" \
    --compiler "$NAMES" > "$OUT/$b.out" 2>&1
  python3 scripts/profile-rank.py "$OUT/$b.json" 18
done
