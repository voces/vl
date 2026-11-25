#!/usr/bin/env bash
# Patches a copy of compiler/ (the dir $1) into the I8 census's probe: one `[ir]` row per function
# under `$VL_IR_SHADOW=5`, `fnc <name>` claimed and `fnu <name> | <miss>` not, and the `is rung` and
# rep-miss classes split by rung and node kind. census.sh and ir-i8-sweep.sh build their probe
# compilers from it. Exits 1 when an anchor in ir_build.vl is not found.
set -euo pipefail
D=${1:?usage: probe-patch.sh <compiler-dir>}
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
' "$D/ir_build.vl" > "$D/ir_build.vl.new"
mv "$D/ir_build.vl.new" "$D/ir_build.vl"
# Two classes split for the census alone: `is rung` names its rung, and a miss at a node with no
# rep (`repMissAt`) names the node's kind. The shipped compiler's classes stay unsplit.
grep -q '^  if arm != "variant" && arm != "armTag" { return irBMiss("is rung") }$' "$D/ir_build.vl" \
  && grep -q '^  return irBMiss(miss)$' "$D/ir_build.vl" \
  || { echo "ir-i8-census: a split anchor in ir_build.vl was not found" >&2; exit 1; }
sed -i -e 's|^  if arm != "variant" \&\& arm != "armTag" { return irBMiss("is rung") }$|  if arm != "variant" \&\& arm != "armTag" { return irBMiss("is rung " + arm) }|' \
  -e 's|^  return irBMiss(miss)$|  return irBMiss(miss + " of " + irAstKind(ix))|' "$D/ir_build.vl"
