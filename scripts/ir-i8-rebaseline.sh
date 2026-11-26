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

# A fixpoint, proved here: the seed builds compiler/ into its own bytes. refresh-compiler.sh's exit
# alone does not prove it, since a seed that cannot compile the source is replaced by a fetched one.
scripts/refresh-compiler.sh > "$T/r1.log" 2>&1 || { echo "rebaseline: refresh failed (see a rerun of scripts/refresh-compiler.sh)"; exit 2; }
grep -q 're-fetching' "$T/r1.log" && { echo "rebaseline: the seed could not compile the source; refresh fell back to a fetched seed"; exit 2; }
# Two steps: the first self-build after a codegen change may differ from the seed once.
for step in 1 2; do
  if ! "$VL" build compiler/entry.vl -o "$T/self.wasm" --compiler "$SEED" > "$T/self.log" 2>&1; then
    echo "rebaseline: the seed does not build compiler/ (no fixpoint):"; grep -v '^ \+[0-9]*:\|^ \+at ' "$T/self.log" | head -5 | sed 's/^/    /'; exit 2
  fi
  cmp -s "$SEED" "$T/self.wasm" && break
  [ "$step" = 2 ] && { echo "rebaseline: no fixpoint: two self-builds still differ"; exit 2; }
  cp "$T/self.wasm" "$SEED"
done
echo "rebaseline: fixpoint seed $(wc -c < "$SEED") bytes"

ROSE=""
# `ratchet <name> <check command...> :: <write command...>`: write only when the check passes.
ratchet() {
  local name=$1; shift
  local check=() write=()
  while [ "$1" != :: ]; do check+=("$1"); shift; done
  shift; write=("$@")
  if "${check[@]}" > "$T/check.log" 2>&1; then
    if "${write[@]}" > "$T/write.log" 2>&1; then echo "rebaseline: $name: written"
    else echo "rebaseline: $name: WRITE FAILED"; tail -5 "$T/write.log" | sed 's/^/    /'; ROSE="$ROSE $name"; fi
  else
    echo "rebaseline: $name: ROSE or failed its check, not written"; tail -5 "$T/check.log" | sed 's/^/    /'; ROSE="$ROSE $name"
  fi
}

for b in scripts/*-budget-baseline.json; do
  case "$b" in *export-budget*|*render-parse-budget*|*pin-helper-budget*) continue ;; esac
  ratchet "${b#scripts/}" "$VL" check --budget "$b" --compiler "$SEED" :: "$VL" check --budget "$b" --compiler "$SEED" --write-baseline
done
"$VL" run scripts/dead-exports.vl --compiler "$SEED" -- --out "$T/dead-exports.json" > /dev/null 2>&1
ratchet export-budget "$VL" check --budget scripts/export-budget-baseline.json --findings "$T/dead-exports.json" --compiler "$SEED" \
  :: "$VL" check --budget scripts/export-budget-baseline.json --findings "$T/dead-exports.json" --compiler "$SEED" --write-baseline
"$VL" run scripts/render-parse-census.vl --compiler "$SEED" -- --out "$T/render-parse.json" > /dev/null 2>&1
ratchet render-parse-budget "$VL" check --budget scripts/render-parse-budget-baseline.json --findings "$T/render-parse.json" --compiler "$SEED" \
  :: "$VL" check --budget scripts/render-parse-budget-baseline.json --findings "$T/render-parse.json" --compiler "$SEED" --write-baseline
# The pin-helper budget is a source count tests/budget_pin_helper_test.ts holds; a fall is lowered here.
pin_was=$(grep -oE '"emit_mono.vl": [0-9]+' scripts/pin-helper-budget-baseline.json | grep -oE '[0-9]+$')
pin_now=$(grep -cE '^(export )?function\s' compiler/emit_mono.vl 2>/dev/null || echo 0)
if [ "$pin_now" -gt "$pin_was" ]; then echo "rebaseline: pin-helper-budget: ROSE $pin_was -> $pin_now, not written"; ROSE="$ROSE pin-helper-budget"
elif [ "$pin_now" -lt "$pin_was" ]; then
  printf '{"emit_mono.vl": %s, "commit": "%s"}\n' "$pin_now" "$(git rev-parse --short=9 HEAD)" > scripts/pin-helper-budget-baseline.json
  echo "rebaseline: pin-helper-budget: written ($pin_was -> $pin_now)"
fi
for s in late-demands self-ir-misses; do
  ratchet "$s" "$VL" run "scripts/$s.vl" --compiler "$SEED" -- --check --seed "$SEED" \
    :: "$VL" run "scripts/$s.vl" --compiler "$SEED" -- --write-baseline --seed "$SEED"
done
ratchet phase-state "$VL" run scripts/phase-state-census.vl --compiler "$SEED" -- --check \
  :: "$VL" run scripts/phase-state-census.vl --compiler "$SEED" -- --write-baseline
ratchet plumb-shape-cost "$VL" run scripts/plumb-shape-cost.vl --compiler "$SEED" -- --check \
  :: "$VL" run scripts/plumb-shape-cost.vl --compiler "$SEED" -- --write-baseline
# Only plumb-shape's two fuels are the deletion's: its RSS and CPU readings depend on the box (and
# are null without GNU time or a native wasm-opt), so those stay the committed baseline's.
PS=scripts/plumb-shape-baseline.json
if git show HEAD:$PS > "$T/ps.json" 2>/dev/null; then
  mapfile -t PF < <(grep -o '"fuel": [0-9]*' "$PS" | awk '{print $2}')
  if [ "${#PF[@]}" = 2 ]; then
    sed -E "s/\"fuel\": [0-9]+/\"fuel\": ${PF[0]}/1; s/(\"tail\": \{\"fuel\": )[0-9]+/\1${PF[1]}/" "$T/ps.json" > "$PS"
  fi
fi

# The two the deletion lowers, written whatever they read.
"$VL" run scripts/seed-size.vl --compiler "$SEED" -- --write-baseline 2>&1 | tail -1 | sed 's/^/rebaseline: seed size: /'
scripts/self-compile-time.sh --write-baseline 2>&1 | grep -E "fuel|wrote" | tail -2 | sed 's/^/rebaseline: self-compile: /'
echo "rebaseline: add the fuel line to scripts/self-compile-ledger.txt (fuel, commit, PR, mechanism)"

git diff --stat -- scripts/ | tail -1
if [ -n "$ROSE" ]; then echo "rebaseline: not written, rose or failed:$ROSE"; exit 1; fi
echo "rebaseline: ok"
