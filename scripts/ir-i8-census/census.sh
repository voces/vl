#!/usr/bin/env bash
# The I8 census (ir-design-2026-11.md §10.3): every function of every I8 population, claimed or
# not as shipped ($VL_IR_SHADOW=5), and the first miss that keeps each unclaimed one.
#
#     scripts/ir-i8-census/census.sh <seed> <out-dir>
#
# Populations: the self-compile, distilled cells/ and named/, every tests/cases program, every
# capability probe, every inventory witness filed `runs` (witnesses.vl), and every scripts/ tool
# (the gate tools are programs I8 must build too). A throwaway copy of
# compiler/ adds one row per function (`fnc <name>` claimed, `fnu <name> | <miss>` not); it is
# built with <seed> in a temp dir, never into build/. A function's name carries its module
# (`$m<id>`) when it is not the entry's, so std functions count once across files.
# Writes <out-dir>/<pop>.rows (file, count, row), <out-dir>/summary.txt (summary.sh), the witnesses
# under <out-dir>/wit, and <out-dir>/programs.txt, every program, for `CENSUS_PROGRAMS=` of
# ir-driver-census.sh. Run from the checkout root; $VL names the host, $JOBS the fan-out (default 4).
# $CENSUS_CLASS names a class-programs.sh list: each population is cut to the programs it lists,
# and the self-compile runs only when the list names it.
set -euo pipefail
SEED=${1:?usage: scripts/ir-i8-census/census.sh <seed> <out-dir>}
OUT=${2:?usage: scripts/ir-i8-census/census.sh <seed> <out-dir>}
VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
JOBS=${JOBS:-4}
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT
mkdir -p "$OUT"
cp -r compiler "$T/probe"
bash scripts/ir-i8-census/probe-patch.sh "$T/probe"
"$VL" build "$T/probe/entry.vl" -o "$T/probe.wasm" --compiler "$SEED" > /dev/null

rm -rf "$OUT/wit"
"$VL" run scripts/ir-i8-census/witnesses.vl -- "$OUT/wit" docs/internals/inventory docs/internals/inventory-2 > "$T/witnesses"
ls scripts/silent-sweep/distilled/cells/*.vl scripts/silent-sweep/distilled/named/*.vl > "$T/distilled"
find tests/cases -name '*.vl' | sort > "$T/cases"
ls scripts/capability-probes/*.vl > "$T/probes"
find scripts -name '*.vl' -not -name '*.matrix.vl' -not -path 'scripts/capability-probes/*' -not -path 'scripts/silent-sweep/distilled/cells/*' -not -path 'scripts/silent-sweep/distilled/named/*' | sort > "$T/scripts"
if [ -n "${CENSUS_CLASS:-}" ]; then
  for pop in distilled cases probes witnesses scripts; do
    awk -F'\t' -v pop="$pop" -v out="$OUT" '$1 == pop { sub(/^wit\//, out "/wit/", $2); print $2 }' "$CENSUS_CLASS" \
      | grep -Fxf - "$T/$pop" > "$T/$pop.cut" || true
    mv "$T/$pop.cut" "$T/$pop"
  done
fi

# One chunk's rows: `<file>\t<count>\t<row>` for every function row and start row, each
# flushed alone, since the parallel chunks share one file and a buffered block splits a row.
cat > "$T/one.sh" <<'ONE'
VL_IR_SHADOW=5 "$VL" check --codegen --compiler "$PROBE" "$@" 2>&1 > /dev/null | awk -F'\t' '
  /^\[ir\] / {
    h = $1; sub(/^\[ir\] /, "", h); n = h; sub(/.*: /, "", n); sub(/: [0-9]+$/, "", h)
    if ($2 ~ /^(fnc |fnu |claimed start|start uncovered |claim fell back)/) { print h "\t" n "\t" $2; fflush() }
  }'
ONE
if [ -z "${CENSUS_CLASS:-}" ] || grep -q '^self'$'\t' "$CENSUS_CLASS"; then
VL_IR_SHADOW=5 "$VL" build compiler/entry.vl -o "$T/self.wasm" --compiler "$T/probe.wasm" 2>&1 > /dev/null \
  | awk -F'\t' '/^\[ir\] / { n = $1; sub(/.*: /, "", n); if ($2 ~ /^(fnc |fnu |claimed start|start uncovered |claim fell back)/) print "self\t" n "\t" $2 }' \
  > "$OUT/self.rows"
  echo 1 > "$OUT/self.programs"
else
  rm -f "$OUT/self.rows" "$OUT/self.programs"
fi
for pop in distilled cases probes witnesses scripts; do
  xargs -r -n 100 -P "$JOBS" env VL="$VL" PROBE="$T/probe.wasm" sh "$T/one.sh" < "$T/$pop" > "$OUT/$pop.rows" || true
  wc -l < "$T/$pop" > "$OUT/$pop.programs"
done
cat "$T/distilled" "$T/cases" "$T/probes" "$T/witnesses" "$T/scripts" > "$OUT/programs.txt"

scripts/ir-i8-census/summary.sh "$OUT" | tee "$OUT/summary.txt"
