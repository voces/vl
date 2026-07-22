#!/usr/bin/env bash
# LOCAL full fuzz sweep — the on-box replacement for the retired fuzz-nightly cron workflow.
# Runs the SAME four legs the workflow ran, each leg fanning its seeds across cores
# (fuzz-nightly.sh --jobs, default nproc-2):
#   plain     — pinned grammar, GATES: any non-baselined INVALID-WASM/TRAP/MISMATCH -> exit 1
#   branching — --branching, report-only (--experimental)
#   multiobs  — --branching --multiobs, report-only
#   declared  — --branching --multiobs --declared, report-only
# Legs run sequentially (each already saturates the cores); per-leg out-dirs land under ONE
# sweep dir with the same layout the workflow artifacted (seed_*.tsv / keep_* / summary.md).
#
# USAGE: scripts/fuzz-sweep.sh [--seeds N] [--count M] [--depths "4 5 6"] [--jobs J]
#                              [--out-dir DIR] [--legs "plain branching multiobs declared"]
# Requires a fresh seed: bash scripts/refresh-compiler.sh
set -uo pipefail
cd "$(dirname "$0")/.."

SEEDS=10
COUNT=200
DEPTHS="4 5 6"
JOBS=""
OUT=""
LEGS="plain branching multiobs declared"
while [ $# -gt 0 ]; do
  case "$1" in
    --seeds) SEEDS="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --depths) DEPTHS="$2"; shift 2 ;;
    --jobs) JOBS="$2"; shift 2 ;;
    --out-dir) OUT="$2"; shift 2 ;;
    --legs) LEGS="$2"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

[ -n "$OUT" ] || OUT="$(mktemp -d -t fuzz-sweep.XXXXXX)"
mkdir -p "$OUT"
echo "fuzz-sweep: out-dir=$OUT  seeds=$SEEDS count=$COUNT depths=\"$DEPTHS\" legs=\"$LEGS\""

fail=0
run_leg() {
  local name="$1"; shift
  echo
  echo "==== leg: $name ===="
  # shellcheck disable=SC2086  # $@ carries bare leg flags
  if ! ./scripts/fuzz-nightly.sh \
    --seeds "$SEEDS" --count "$COUNT" --depths "$DEPTHS" \
    ${JOBS:+--jobs "$JOBS"} \
    --baseline scripts/rep-fuzz-baseline.txt \
    --out-dir "$OUT/$name" "$@"; then
    fail=1
  fi
}

for leg in $LEGS; do
  case "$leg" in
    plain) run_leg plain ;;
    branching) run_leg branching --branching --experimental ;;
    multiobs) run_leg multiobs --branching --multiobs --experimental ;;
    declared) run_leg declared --branching --multiobs --declared --experimental ;;
    *) echo "unknown leg: $leg"; exit 2 ;;
  esac
done

echo
echo "==== fuzz-sweep: combined summary ===="
for leg in $LEGS; do
  [ -f "$OUT/$leg/summary.md" ] && { echo "-- $leg --"; cat "$OUT/$leg/summary.md"; echo; }
done

if [ "$fail" -ne 0 ]; then
  echo "fuzz-sweep: GATING LEG FAILED (non-baselined unsound findings above; keep dirs in $OUT)"
  exit 1
fi
echo "fuzz-sweep: OK (gating leg clean; report legs are survey-only)"
