#!/usr/bin/env bash
# THE L2 TRIPWIRE: the candidate compiling the compiler, in CPU seconds, against a
# committed baseline. Fails only past 2x.
#
# It is a tripwire, not a measurement. A cost regression does not slow the SOURCE, it
# slows the compiler BUILT from it — stage 3 runs the old compiler and stays fast, so an
# L1-only check is vacuous for this class (CLAUDE.md, "A COST REGRESSION SHOWS UP ONE
# BOOTSTRAP STEP LATE"; D1090 measured 32 s at L1 against 321 s at L2 for one ungated
# collect pass). The shape family in tests/vl_scaling_shape_test.ts is the instrument that
# says WHICH axis; this one only says the bootstrap got dramatically dearer.
#
# THE BAND IS WIDE ON PURPOSE, AND HALF OF IT IS SPENT ON CONTENTION. CPU seconds are the
# honest column when other work owns the cores, but they are NOT contention-proof: the same
# build measured 6.0-6.3 s idle and 12.2-12.7 s inside a fanned-out `gate.sh` at load 164
# (2026-09-03, this box, three samples each). The first cut of this script committed the
# idle number with a factor of 2 and the gate row went red on its own ladder at 12.7 s
# against a 12.6 s line. So the baseline stays the IDLE reading — reproducible on any box,
# including after a careless re-baseline — and the FACTOR carries the contention: 2x for a
# busy box, 2x for a regression worth stopping the world for. The class this guards is a
# 5-10x blowup (D1090 was 32 s at L1 against 321 s at L2), not a 2x one.
#
#   scripts/self-compile-time.sh                   # grade
#   scripts/self-compile-time.sh --write-baseline  # after a real improvement lands
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
SEED="${SEED:-build/vl-compiler.wasm}"
BASELINE="${BASELINE:-scripts/self-compile-baseline.json}"
# Read from the baseline file, so the committed number and the committed band travel
# together and `--write-baseline` cannot silently change the band.
FACTOR="${FACTOR:-$(awk -F'[:,]' '/"factor"/{gsub(/[^0-9.]/, "", $2); print $2}' "$BASELINE")}"

[ -x "$VL" ] || { echo "missing vl binary: $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
[ -f "$SEED" ] || { echo "missing seed: $SEED (scripts/refresh-compiler.sh)"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# WARM THE `.cwasm` SIDECAR FIRST — untimed. A freshly refreshed seed has none, and
# Cranelift-compiling it costs 7.9 s CPU of the 14.2 s a cold run measures, against 6.3-7.4 s
# warm (measured 2026-09-03, this box). That is engine start-up, not compilation, and
# including it would make the tripwire fire on whichever gate row reached the new seed
# first. lint-self.sh warms the same way and for the same reason.
printf 'print(1)\n' > "$WORK/warm.vl"
timeout 600 "$VL" build "$WORK/warm.vl" -o "$WORK/warm.wasm" --compiler "$SEED" > /dev/null

# The seed was refreshed from the current source, so this IS stage 4: the candidate
# compiling the compiler. `timeout` bounds the BUILD, never the shell around it — a
# killed shell leaves the build re-parented to init at 90% of a core, and five of those
# accumulated over 97 minutes once (CLAUDE.md, "timeout KILLS THE SHELL, NOT THE BUILD").
{ time -p timeout 600 "$VL" build compiler/entry.vl -o "$WORK/l2.wasm" --compiler "$SEED"; } \
  2> "$WORK/t" || { echo "L2 self-compile FAILED (rc above; 124 is a real hang)"; cat "$WORK/t"; exit 1; }
CPU=$(awk '/^user/{u=$2} /^sys/{s=$2} END{printf "%.1f", u + s}' "$WORK/t")

if [ "${1:-}" = "--write-baseline" ]; then
  printf '{\n"cpu_seconds": %s,\n"factor": %s,\n"note": "candidate compiles the compiler; CPU seconds, taken on a QUIET box. Half the factor pays for contention — the same build reads about 2x this inside a fanned-out gate.sh. `scripts/self-compile-time.sh --write-baseline`"\n}\n' \
    "$CPU" "$FACTOR" > "$BASELINE"
  echo "wrote $BASELINE: ${CPU}s CPU"
  exit 0
fi

BASE=$(awk -F'[:,]' '/cpu_seconds/{gsub(/[^0-9.]/, "", $2); print $2}' "$BASELINE")
LIMIT=$(awk -v b="$BASE" -v f="$FACTOR" 'BEGIN{printf "%.1f", b * f}')
echo "L2 self-compile ${CPU}s CPU (baseline ${BASE}s, trips past ${LIMIT}s)"
awk -v c="$CPU" -v l="$LIMIT" 'BEGIN{exit !(c > l)}' && {
  echo "SELF-COMPILE TIME TRIPWIRE: ${CPU}s CPU is over ${FACTOR}x the ${BASE}s baseline."
  echo "  A pass is probably scaling with the program rather than with its input. Rank the"
  echo "  run by self time (docs/internals/profiling-the-compiler.md), and read"
  echo "  tests/vl_scaling_shape_test.ts's failures for which axis. If the box was simply"
  echo "  busy, re-run; if the compiler genuinely got faster, lower the baseline with"
  echo "  scripts/self-compile-time.sh --write-baseline"
  exit 1
}
echo "self-compile time ok"
