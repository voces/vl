#!/usr/bin/env bash
# The I8 PR's one rebaseline step (coordinator ruling, 2026-11-25): from a fixpoint seed, every
# ratchet the deletion moves takes its new reading in the same PR. A ratchet that may only fall
# is checked first and rewritten only when the check passes; one that rose is reported and the
# script exits 1, since a deletion should raise no count. Seed size and self-compile fuel fall
# with the deletion and are written unconditionally; the fuel ledger line is the author's.
#   scripts/ir-i8-rebaseline.sh            refresh to a fixpoint, then rebaseline
# Run from the checkout root after `ir-i8-sweep.sh <keep> --apply`. $VL names the host.
set -uo pipefail
VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
SEED=build/vl-compiler.wasm
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT
export VL_BIN="$VL"

# A fixpoint: a second refresh builds the same bytes as the first.
scripts/refresh-compiler.sh > "$T/r1.log" 2>&1 || { echo "rebaseline: refresh failed (see a rerun of scripts/refresh-compiler.sh)"; exit 2; }
cp "$SEED" "$T/s1.wasm"
scripts/refresh-compiler.sh > "$T/r2.log" 2>&1 || { echo "rebaseline: second refresh failed"; exit 2; }
cmp -s "$SEED" "$T/s1.wasm" || { echo "rebaseline: no fixpoint after two refreshes"; exit 2; }
echo "rebaseline: fixpoint seed $(wc -c < "$SEED") bytes"

ROSE=""
# `ratchet <name> <check command...> -- <write command...>`: write only when the check passes.
ratchet() {
  local name=$1; shift
  local check=() write=()
  while [ "$1" != -- ]; do check+=("$1"); shift; done
  shift; write=("$@")
  if "${check[@]}" > "$T/check.log" 2>&1; then
    if "${write[@]}" > "$T/write.log" 2>&1; then echo "rebaseline: $name: written"
    else echo "rebaseline: $name: WRITE FAILED"; tail -5 "$T/write.log" | sed 's/^/    /'; ROSE="$ROSE $name"; fi
  else
    echo "rebaseline: $name: ROSE or failed its check, not written"; tail -5 "$T/check.log" | sed 's/^/    /'; ROSE="$ROSE $name"
  fi
}

for b in scripts/*-budget-baseline.json; do
  case "$b" in *export-budget*|*render-parse-budget*) continue ;; esac
  ratchet "${b#scripts/}" "$VL" check --budget "$b" --compiler "$SEED" -- "$VL" check --budget "$b" --compiler "$SEED" --write-baseline
done
"$VL" run scripts/dead-exports.vl --compiler "$SEED" -- --out "$T/dead-exports.json" > /dev/null 2>&1
ratchet export-budget "$VL" check --budget scripts/export-budget-baseline.json --findings "$T/dead-exports.json" --compiler "$SEED" \
  -- "$VL" check --budget scripts/export-budget-baseline.json --findings "$T/dead-exports.json" --compiler "$SEED" --write-baseline
"$VL" run scripts/render-parse-census.vl --compiler "$SEED" -- --out "$T/render-parse.json" > /dev/null 2>&1
ratchet render-parse-budget "$VL" check --budget scripts/render-parse-budget-baseline.json --findings "$T/render-parse.json" --compiler "$SEED" \
  -- "$VL" check --budget scripts/render-parse-budget-baseline.json --findings "$T/render-parse.json" --compiler "$SEED" --write-baseline
for s in late-demands self-ir-misses; do
  ratchet "$s" "$VL" run "scripts/$s.vl" --compiler "$SEED" -- --check --seed "$SEED" \
    -- "$VL" run "scripts/$s.vl" --compiler "$SEED" -- --write-baseline --seed "$SEED"
done
ratchet phase-state "$VL" run scripts/phase-state-census.vl --compiler "$SEED" -- --check \
  -- "$VL" run scripts/phase-state-census.vl --compiler "$SEED" -- --write-baseline
ratchet plumb-shape-cost "$VL" run scripts/plumb-shape-cost.vl --compiler "$SEED" -- --check \
  -- "$VL" run scripts/plumb-shape-cost.vl --compiler "$SEED" -- --write-baseline

# The two the deletion lowers, written whatever they read.
"$VL" run scripts/seed-size.vl --compiler "$SEED" -- --write-baseline 2>&1 | tail -1 | sed 's/^/rebaseline: seed size: /'
scripts/self-compile-time.sh --write-baseline 2>&1 | grep -E "fuel|wrote" | tail -2 | sed 's/^/rebaseline: self-compile: /'
echo "rebaseline: add the fuel line to scripts/self-compile-ledger.txt (fuel, commit, PR, mechanism)"

git diff --stat -- scripts/ | tail -1
if [ -n "$ROSE" ]; then echo "rebaseline: not written, rose or failed:$ROSE"; exit 1; fi
echo "rebaseline: ok"
