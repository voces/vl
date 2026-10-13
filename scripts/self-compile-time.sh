#!/usr/bin/env bash
# THE L2 TRIPWIRE: the candidate compiling the compiler, in guest FUEL, against a committed
# baseline. Fails past the baseline's factor (1.5x).
#
# It is a tripwire, not a measurement. A cost regression does not slow the SOURCE, it
# slows the compiler BUILT from it — stage 3 runs the old compiler and stays fast, so an
# L1-only check is vacuous for this class (CLAUDE.md, "A COST REGRESSION SHOWS UP ONE
# BOOTSTRAP STEP LATE"; D1090 measured 32 s at L1 against 321 s at L2 for one ungated
# collect pass). The shape family in tests/vl_scaling_shape_test.ts is the instrument that
# says WHICH axis; this one only says the bootstrap got dearer.
#
# FUEL, NOT CPU SECONDS. `$VL_FUEL=1` makes the host meter the guest in wasmtime fuel, about
# one unit per guest instruction: a COUNT, the same on every run of the same seed over the
# same source however busy the box is. The CPU-second version of this row read 6.3 s idle
# and 26.8-27.6 s at load 40-50 on docs-only PRs whose seed was master's own fixpoint, past
# a 4x line whose factor was mostly there to pay for contention. With the contention gone
# the factor only has to pay for the compiler GROWING between re-baselines, so it is 1.5x —
# tighter than the old line ever was on a quiet box. CPU is still printed, and not graded.
#
#   scripts/self-compile-time.sh                   # grade
#   scripts/self-compile-time.sh --write-baseline  # after a real change in cost lands
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
# The self-compile's collector is a CHOICE, not the default's accident: pinned so the
# committed baseline always prices the same collector (DECISIONS.md, "The compiler's
# collector is copying by default").
export VL_COMPILE_GC=null
SEED="${SEED:-build/vl-compiler.wasm}"
SRC="${SRC:-compiler/entry.vl}"
BASELINE="${BASELINE:-scripts/self-compile-baseline.json}"
# Read from the baseline file, so the committed number and the committed band travel
# together and `--write-baseline` cannot silently change the band.
FACTOR="${FACTOR:-$(awk -F'[:,]' '/"factor"/{gsub(/[^0-9.]/, "", $2); print $2}' "$BASELINE")}"

[ -x "$VL" ] || { echo "missing vl binary: $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
[ -f "$SEED" ] || { echo "missing seed: $SEED (scripts/refresh-compiler.sh)"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# WARM THE FUEL ENGINE'S `.cwasm` SIDECAR FIRST, untimed. A fuel engine compiles the seed to
# different code and caches it under its own sidecar; a fresh seed has none, and Cranelift
# costs CPU but no fuel, so this only keeps the printed CPU honest.
printf 'print(1)\n' > "$WORK/warm.vl"
VL_FUEL=1 timeout 600 "$VL" build "$WORK/warm.vl" -o "$WORK/warm.wasm" --compiler "$SEED" > /dev/null 2>&1

# The seed was refreshed from the current source, so this IS stage 4: the candidate
# compiling the compiler. `timeout` bounds the BUILD, never the shell around it — a
# killed shell leaves the build re-parented to init at 90% of a core (CLAUDE.md,
# "timeout KILLS THE SHELL, NOT THE BUILD").
{ time -p VL_FUEL=1 timeout 600 "$VL" build "$SRC" -o "$WORK/l2.wasm" --compiler "$SEED"; } \
  2> "$WORK/t" || { echo "L2 self-compile FAILED (rc above; 124 is a real hang)"; cat "$WORK/t"; exit 1; }
CPU=$(awk '/^user/{u=$2} /^sys/{s=$2} END{printf "%.1f", u + s}' "$WORK/t")
FUEL=$(awk '/^\[fuel\] guest: [0-9]+$/{print $3}' "$WORK/t")
[ -n "$FUEL" ] || { echo "this host prints no \`[fuel]\` line (it predates \$VL_FUEL); rebuild scripts/vl-host"; exit 1; }

if [ "${1:-}" = "--write-baseline" ]; then
  COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
  printf '{\n"fuel": %s,\n"factor": %s,\n"commit": "%s",\n"note": "candidate compiles the compiler, VL_FUEL=1 guest fuel: a count, so load cannot move it. Re-baseline when the cost really changes: scripts/self-compile-time.sh --write-baseline"\n}\n' \
    "$FUEL" "$FACTOR" "$COMMIT" > "$BASELINE"
  echo "wrote $BASELINE: fuel $FUEL (${CPU}s CPU, not recorded)"
  exit 0
fi

BASE=$(awk -F'[:,]' '/"fuel"/{gsub(/[^0-9]/, "", $2); print $2}' "$BASELINE")
LIMIT=$(awk -v b="$BASE" -v f="$FACTOR" 'BEGIN{printf "%.0f", b * f}')
PCT=$(awk -v c="$FUEL" -v b="$BASE" 'BEGIN{printf "%+.1f", 100 * (c - b) / b}')
echo "L2 self-compile fuel $FUEL (${PCT}% on baseline $BASE, trips past $LIMIT = ${FACTOR}x); ${CPU}s CPU, not graded"
awk -v c="$FUEL" -v l="$LIMIT" 'BEGIN{exit !(c > l)}' && {
  echo "SELF-COMPILE COST TRIPWIRE: fuel $FUEL is over ${FACTOR}x the $BASE baseline."
  echo "  Fuel is a count of guest work, so a busy box is NOT the explanation. A pass is"
  echo "  probably scaling with the program rather than with its input. Rank the run by"
  echo "  self time (docs/internals/profiling-the-compiler.md), and read"
  echo "  tests/vl_scaling_shape_test.ts's failures for which axis. If the cost is accepted,"
  echo "  or the compiler genuinely got cheaper, re-baseline in the same PR with"
  echo "  scripts/self-compile-time.sh --write-baseline"
  exit 1
}
echo "self-compile time ok"
