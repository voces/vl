#!/usr/bin/env bash
# Which IR decline templates (`irLMiss`, `irBMiss`, `missRhs`) a program reaches today.
#
#     scripts/ir-decline-reach/run.sh [--seed S] [--out DIR] [--no-self] [LIST...]
#
# Applies `probe.patch` to a copy of `compiler/` in a throwaway tree, never to the tree itself,
# and builds a probe compiler there with the seed (default build/vl-compiler.wasm). The probe
# notes every recorded miss as an `[ir]` row (`$VL_IR_SHADOW=5`), a counter, no byte marker.
# Each LIST is a file of program paths, one per line; with none, the corpus cases, the
# distilled cells and the capability probes. The self-compile runs too unless `--no-self`.
# Prints `aggregate.vl`'s table; the rows and the templates stay in DIR. Run from the checkout
# root. Exit 1 when the patch no longer applies: re-anchor it on irLMiss, irBMiss,
# irShadowRowCount and emitUnclaimed.
set -euo pipefail

ROOT="$(pwd)"
SEED="$ROOT/build/vl-compiler.wasm"
OUT=""
SELF=1
LISTS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --seed) SEED="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --no-self) SELF=0; shift ;;
    *) LISTS+=("$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"); shift ;;
  esac
done
VL="${VL:-$ROOT/scripts/vl-host/target/release/vl}"
T="$(mktemp -d "${TMPDIR:-/tmp}/ir-decline-reach.XXXXXX")"
trap 'rm -rf "$T"' EXIT
if [ -z "$OUT" ]; then OUT="$T/out"; fi
mkdir -p "$OUT"

mkdir -p "$T/tree"
git archive HEAD | tar -x -C "$T/tree"
cp -r "$ROOT/compiler/." "$T/tree/compiler/"
if ! (cd "$T/tree" && git apply "$ROOT/scripts/ir-decline-reach/probe.patch"); then
  echo "ir-decline-reach: probe.patch does not apply to this tree" >&2
  exit 1
fi
(cd "$T/tree" && VL_STD="$T/tree/std" "$VL" build compiler/entry.vl -o "$T/probe.wasm" --compiler "$SEED" > /dev/null)

if [ ${#LISTS[@]} -eq 0 ]; then
  find "$ROOT/tests/cases" -name '*.vl' | sort > "$T/cases.list"
  find "$ROOT/scripts/silent-sweep/distilled/cells" "$ROOT/scripts/silent-sweep/distilled/named" -name '*.vl' | sort > "$T/distilled.list"
  ls "$ROOT"/scripts/capability-probes/*.vl > "$T/probes.list"
  LISTS=("$T/cases.list" "$T/distilled.list" "$T/probes.list")
fi
cat "${LISTS[@]}" > "$T/all.list"
split -n l/"${JOBS:-4}" "$T/all.list" "$T/part."
: > "$OUT/rows"
for p in "$T"/part.*; do
  ( VL_STD="$ROOT/std" VL_IR_SHADOW=5 "$VL" check --codegen --compiler "$T/probe.wasm" $(cat "$p") 2>&1 > /dev/null \
      | grep -P '^\[ir\] .*: \d+\tZ' > "$p.rows" || true ) &
done
wait
cat "$T"/part.*.rows >> "$OUT/rows"
if [ "$SELF" = 1 ]; then
  ( cd "$T/tree" && VL_STD="$T/tree/std" VL_IR_SHADOW=5 "$VL" build compiler/entry.vl -o "$T/self.wasm" --compiler "$T/probe.wasm" 2>&1 > /dev/null \
      | grep -P '^\[ir\] .*: \d+\tZ' >> "$OUT/rows" || true )
fi
VL_STD="$ROOT/std" "$VL" run scripts/emit-refusal-sites.vl -- --ir > "$OUT/templates" 2>/dev/null
echo "programs: $(wc -l < "$T/all.list") · rows: $(wc -l < "$OUT/rows")"
VL_STD="$ROOT/std" "$VL" run scripts/ir-decline-reach/aggregate.vl -- "$OUT/rows" "$OUT/templates"
