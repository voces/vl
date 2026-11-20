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
# Writes <out-dir>/<pop>.rows (file, count, row) and <out-dir>/summary.txt. Run from the checkout
# root; $VL names the host, $JOBS the fan-out (default 4).
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

"$VL" run scripts/ir-i8-census/witnesses.vl -- "$T/wit" docs/internals/inventory docs/internals/inventory-2 > "$T/witnesses"
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
  xargs -n 100 -P "$JOBS" env VL="$VL" PROBE="$T/probe.wasm" sh "$T/one.sh" < "$T/$pop" > "$OUT/$pop.rows" || true
  wc -l < "$T/$pop" > "$OUT/$pop.programs"
done
echo 1 > "$OUT/self.programs"

# Per population: programs, functions claimed / total (per file and per distinct function), start
# bodies claimed, and the first misses ranked by the distinct functions they keep.
for pop in self distilled cases probes witnesses; do
  awk -F'\t' -v pop="$pop" -v progs="$(cat "$OUT/$pop.programs")" '
    function key(f, nm) { return (nm ~ /\$m/) ? nm : f "::" nm }
    $3 ~ /^fnc / { nm = substr($3, 5); fc++; k = key($1, nm); if (!(k in st)) st[k] = "c"; files[$1] = 1; next }
    $3 ~ /^fnu / {
      r = substr($3, 5); i = index(r, " | "); nm = substr(r, 1, i - 1); why = substr(r, i + 3)
      fu++; mf[why]++; k = key($1, nm); st[k] = "u"; dw[k] = why; files[$1] = 1; next
    }
    $3 == "claimed start" { sc += $2; files[$1] = 1; next }
    $3 ~ /^start uncovered / { su += $2; sm[substr($3, 17)] += $2; files[$1] = 1; next }
    END {
      for (k in st) { d++; if (st[k] == "c") dc++; else dm[dw[k]]++ }
      nf = 0; for (f in files) nf++
      printf "== %s: %d programs (%d with rows)\n", pop, progs, nf
      printf "functions per file: %d claimed of %d (%.1f%%)\n", fc, fc + fu, (fc + fu) ? 100 * fc / (fc + fu) : 0
      printf "distinct functions: %d claimed of %d (%.1f%%)\n", dc, d, d ? 100 * dc / d : 0
      printf "start bodies: %d claimed of %d\n", sc, sc + su
      print "first misses (distinct functions kept, then per-file count):"
      for (w in dm) printf "  %6d %6d  %s\n", dm[w], mf[w], w | "sort -rn | head -25"
      close("sort -rn | head -25")
      print "start misses:"
      for (w in sm) printf "  %6d  %s\n", sm[w], w | "sort -rn | head -10"
      close("sort -rn | head -10")
      print ""
    }' "$OUT/$pop.rows"
done > "$OUT/summary.txt"
cat "$OUT/summary.txt"
