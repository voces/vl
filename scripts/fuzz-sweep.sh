#!/usr/bin/env bash
# LOCAL full fuzz sweep — the on-box replacement for the retired fuzz-nightly cron workflow.
# Runs the SAME four legs the workflow ran, each leg fanning its seeds across cores
# (fuzz-nightly.sh --jobs, default nproc-2):
#   plain     — pinned grammar, GATES: any non-baselined INVALID-WASM/TRAP/MISMATCH -> exit 1
#   branching — --branching, report-only (--experimental)
#   multiobs  — --branching --multiobs, report-only
#   declared  — --branching --multiobs --declared, report-only
#   oracle    — scripts/oracle/fuzz.sh --gen all: arithmetic, data and rep programs run compiled and in the
#               independent oracle; GATES on a disagreement scripts/oracle/known.txt does not list
# Legs run sequentially (each already saturates the cores); per-leg out-dirs land under ONE
# sweep dir with the same layout the workflow artifacted (seed_*.tsv / keep_* / summary.md).
# Each unsound finding then gets a ready-to-file row draft, `keep_<seed>/case_N.row.md`
# (scripts/fuzz-draft-rows.sh: minimised, de-duplicated, with a family guess); `--no-drafts` skips it.
#
# USAGE: scripts/fuzz-sweep.sh [--seeds N] [--count M] [--depths "4 5 6"] [--jobs J]
#                              [--out-dir DIR] [--legs "plain branching multiobs declared oracle"] [--no-drafts]
#                              [--filed FILE] [--gate-all]
#   --filed FILE  unsound findings an open inventory row already files (fuzz-nightly.sh --filed)
#   --gate-all    the three report legs gate on a new unsound finding too, beside `plain` and `oracle`
# Requires a fresh seed: bash scripts/refresh-compiler.sh
set -uo pipefail
cd "$(dirname "$0")/.."

SEEDS=10
COUNT=200
DEPTHS="4 5 6"
JOBS=""
OUT=""
LEGS="plain branching multiobs declared oracle"
DRAFTS=1
FILED=""
GATE_ALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --seeds) SEEDS="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --depths) DEPTHS="$2"; shift 2 ;;
    --jobs) JOBS="$2"; shift 2 ;;
    --out-dir) OUT="$2"; shift 2 ;;
    --legs) LEGS="$2"; shift 2 ;;
    --no-drafts) DRAFTS=0; shift ;;
    --filed) FILED="$2"; shift 2 ;;
    --gate-all) GATE_ALL=1; shift ;;
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
    ${FILED:+--filed "$FILED"} \
    --out-dir "$OUT/$name" "$@"; then
    fail=1
  fi
}

# A report leg passes --experimental unless --gate-all asks every leg to gate.
REPORT="--experimental"
[ "$GATE_ALL" -eq 0 ] || REPORT=""
for leg in $LEGS; do
  case "$leg" in
    plain) run_leg plain ;;
    branching) run_leg branching --branching $REPORT ;;
    multiobs) run_leg multiobs --branching --multiobs $REPORT ;;
    declared) run_leg declared --branching --multiobs --declared $REPORT ;;
    oracle)
      echo; echo "==== leg: oracle ===="
      mkdir -p "$OUT/oracle"
      if ! ./scripts/oracle/fuzz.sh --seeds "$SEEDS" --count "$COUNT" --gen all --keep "$OUT/oracle" | tee "$OUT/oracle/summary.md"; then
        fail=1
      fi ;;
    *) echo "unknown leg: $leg"; exit 2 ;;
  esac
done

echo
echo "==== fuzz-sweep: combined summary ===="
for leg in $LEGS; do
  [ -f "$OUT/$leg/summary.md" ] && { echo "-- $leg --"; cat "$OUT/$leg/summary.md"; echo; }
done

if [ "$DRAFTS" -eq 1 ]; then
  echo
  echo "==== fuzz-sweep: row drafts ===="
  ./scripts/fuzz-draft-rows.sh "$OUT"
fi

if [ "$fail" -ne 0 ]; then
  echo "fuzz-sweep: GATING LEG FAILED (unfiled unsound findings above; keep dirs in $OUT)"
  exit 1
fi
if [ "$GATE_ALL" -eq 1 ]; then
  echo "fuzz-sweep: OK (no leg found an unfiled unsound finding)"
else
  echo "fuzz-sweep: OK (gating leg clean; report legs are survey-only)"
fi
