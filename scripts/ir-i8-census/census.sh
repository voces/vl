#!/usr/bin/env bash
# The I8 census (ir-design-2026-11.md §10.3): every function of every I8 population, claimed or
# not as shipped ($VL_IR_SHADOW=5), and the first miss that keeps each unclaimed one.
#
#     scripts/ir-i8-census/census.sh <seed> <out-dir>
#
# Populations: the self-compile, distilled cells/ and named/, every tests/cases program, every
# capability probe, and every inventory witness filed `runs` (witnesses.vl). A throwaway copy of
# compiler/ adds one row per function (`fnc <name>` claimed, `fnu <name> | <miss>` not); it is
# built with <seed> in a temp dir, never into build/. A function's name carries its module
# (`$m<id>`) when it is not the entry's, so std functions count once across files.
# Writes <out-dir>/<pop>.rows (file, count, row), <out-dir>/summary.txt (summary.sh), the witnesses
# under <out-dir>/wit, and <out-dir>/programs.txt, every program, for `CENSUS_PROGRAMS=` of
# ir-driver-census.sh. Run from the checkout root; $VL names the host, $JOBS the fan-out (default 4).
set -euo pipefail
SEED=${1:?usage: scripts/ir-i8-census/census.sh <seed> <out-dir>}
OUT=${2:?usage: scripts/ir-i8-census/census.sh <seed> <out-dir>}
VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
JOBS=${JOBS:-4}
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT
mkdir -p "$OUT"
cp -r compiler "$T/probe"
awk '
  /^  if built != "" \|\| repNodeGen\(\) != gen \|\| !claimable\(\) \{ return false \}$/ {
    print "  if built != \"\" || repNodeGen() != gen || !claimable() {"
    print "    count(\"fnu \" + ib.irName + \" | \" + (if built != \"\" { built } else { \"not claimable\" }))"
    print "    return false"
    print "  }"
    a = 1; next
  }
  /^    count\("claim fell back: " \+ why\)$/ && !b { print; print "    count(\"fnu \" + ib.irName + \" | claim fell back: \" + why)"; b = 1; next }
  /^  count\("claimed"\)$/ { print; print "  count(\"fnc \" + ib.irName)"; c = 1; next }
  { print }
  END { if (!a || !b || !c) { print "ir-i8-census: a probe anchor in ir_build.vl was not found" > "/dev/stderr"; exit 1 } }
' "$T/probe/ir_build.vl" > "$T/ir_build.vl"
mv "$T/ir_build.vl" "$T/probe/ir_build.vl"
"$VL" build "$T/probe/entry.vl" -o "$T/probe.wasm" --compiler "$SEED" > /dev/null

rm -rf "$OUT/wit"
"$VL" run scripts/ir-i8-census/witnesses.vl -- "$OUT/wit" docs/internals/inventory docs/internals/inventory-2 > "$T/witnesses"
ls scripts/silent-sweep/distilled/cells/*.vl scripts/silent-sweep/distilled/named/*.vl > "$T/distilled"
find tests/cases -name '*.vl' | sort > "$T/cases"
ls scripts/capability-probes/*.vl > "$T/probes"

# One chunk's rows: `<file>\t<count>\t<row>` for every function row and start row.
cat > "$T/one.sh" <<'ONE'
VL_IR_SHADOW=5 "$VL" check --codegen --compiler "$PROBE" "$@" 2>&1 > /dev/null | awk -F'\t' '
  /^\[ir\] / {
    h = $1; sub(/^\[ir\] /, "", h); n = h; sub(/.*: /, "", n); sub(/: [0-9]+$/, "", h)
    if ($2 ~ /^(fnc |fnu |claimed start|start uncovered |claim fell back)/) print h "\t" n "\t" $2
  }'
ONE
VL_IR_SHADOW=5 "$VL" build compiler/entry.vl -o "$T/self.wasm" --compiler "$T/probe.wasm" 2>&1 > /dev/null \
  | awk -F'\t' '/^\[ir\] / { n = $1; sub(/.*: /, "", n); if ($2 ~ /^(fnc |fnu |claimed start|start uncovered |claim fell back)/) print "self\t" n "\t" $2 }' \
  > "$OUT/self.rows"
for pop in distilled cases probes witnesses; do
  # Each chunk writes its own file: parallel writers into one pipe interleave long rows.
  mkdir -p "$T/rows-$pop"
  xargs -n 100 -P "$JOBS" env VL="$VL" PROBE="$T/probe.wasm" sh -c \
    'sh "$0" "$@" > "$(mktemp -p "'"$T/rows-$pop"'")"' "$T/one.sh" < "$T/$pop" || true
  cat "$T/rows-$pop"/* > "$OUT/$pop.rows" 2> /dev/null || : > "$OUT/$pop.rows"
  wc -l < "$T/$pop" > "$OUT/$pop.programs"
done
echo 1 > "$OUT/self.programs"
cat "$T/distilled" "$T/cases" "$T/probes" "$T/witnesses" > "$OUT/programs.txt"

scripts/ir-i8-census/summary.sh "$OUT" | tee "$OUT/summary.txt"
