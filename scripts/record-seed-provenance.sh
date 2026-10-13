#!/usr/bin/env bash
# Record what a seed was built FROM, or fail LOUD.
#
#   scripts/record-seed-provenance.sh <seed>
#
# `refresh-compiler.sh` used to run the recorder with `|| echo note:`, so a recorder that
# could not start left the seed with NO recorded identity while the refresh still reported
# success — and a seed with no identity is graded against whatever tree is checked out,
# which is the pairing `seed-provenance.vl` exists to refuse.
#
# The recorder is a VL program, compiled by `$COMPILER` (default: the seed being recorded,
# which `refresh-compiler.sh` has just built and warmed) and run by `$VL`. Both are seams
# a test can point at a program that cannot run. A failure removes any sidecar and exits
# non-zero naming COMPILER.
set -uo pipefail
cd "$(dirname "$0")/.."

SEED="${1:?usage: record-seed-provenance.sh <seed>}"
SIDE="$SEED.src"
VL="${VL:-scripts/vl-host/target/release/vl}"
COMPILER="${COMPILER:-$SEED}"

# Cleared first: a failure below must leave NO sidecar, never the PREVIOUS seed's identity,
# which a grader would read as this seed's.
rm -f "$SIDE"

if "$VL" run scripts/seed-provenance.vl --compiler "$COMPILER" -- --write --seed "$SEED" > /dev/null 2>&1; then
  exit 0
fi

echo "ERROR: could not record the seed's source identity ($SIDE)." >&2
echo "  Tried COMPILER=$COMPILER under VL=$VL; scripts/seed-provenance.vl did not run." >&2
echo "  A seed with no sidecar is graded against whatever tree is checked out — the pairing" >&2
echo "  failure that made three landed fixes read as MOVED on 2026-09-06. Not a soft note." >&2
echo "  Fix: re-run with COMPILER=/path/to/a/working/vl-compiler.wasm." >&2
exit 1
