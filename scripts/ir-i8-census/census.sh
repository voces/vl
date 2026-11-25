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
# Two classes split for the census alone: `is rung` names its rung, and a miss at a node with no
# rep (`repMissAt`) names the node's kind. The shipped compiler's classes stay unsplit.
grep -q '^  if arm != "variant" && arm != "armTag" { return irBMiss("is rung") }$' "$T/probe/ir_build.vl" \
  && grep -q '^  return irBMiss(miss)$' "$T/probe/ir_build.vl" \
  || { echo "ir-i8-census: a split anchor in ir_build.vl was not found" >&2; exit 1; }
sed -i -e 's|^  if arm != "variant" \&\& arm != "armTag" { return irBMiss("is rung") }$|  if arm != "variant" \&\& arm != "armTag" { return irBMiss("is rung " + arm) }|' \
  -e 's|^  return irBMiss(miss)$|  return irBMiss(miss + " of " + irAstKind(ix))|' "$T/probe/ir_build.vl"
# The call classes split the same way (COV-CALL): `call of a non-declaration` and `indirect call`
# name why `callRefPlainKey` refused (`censusPlainWhy`, a copy of its ladder) or the callee's
# shape, and `intrinsic <arm>` names the intrinsic.
cat >> "$T/probe/wasmEmit.vl" <<'WHY'

export function censusNodeKind(ix: i32): string {
  if ix < 0 || ix >= P.nodes.length { return "none" }
  const n = nodeAt(ix)
  if n is Ident { return "Ident" }
  if n is Member { return "Member" }
  if n is Call { return "Call" }
  if n is Index { return "Index" }
  if n is NullLit { return "NullLit" }
  if n is LetDecl { return "LetDecl" }
  if n is Param { return "Param" }
  if n is LoopVar { return "LoopVar" }
  if n is FuncDecl { return "FuncDecl" }
  return "other"
}

export function censusPlainWhy(callIx: i32, fnIx: i32): string {
  const c = if callIx >= 0 && callIx < P.nodes.length { nodeAt(callIx) } else { null }
  if !(c is Call) || c.callFn < 0 || hasNamedArgs(c.callArgNames) { return "named" }
  const callee = nodeAt(c.callFn)
  if !(callee is Ident) {
    const h = if callee is Member { "field" } else { "expr" }
    if !exprIsClosure(c.callFn, fnIx) {
      if callResultMemberTy(unwrapParen(c.callFn), fnIx) >= 0 { return h + " result member" }
      return h + " not a closure: " + censusNodeKind(c.callFn)
    }
    if bundleParamOfRead(c.callFn, fnIx) >= 0 { return h + " bundle" }
    if placeRecordSigs(callIx, fnIx).length > 0 { return h + " place record" }
    return censusTailWhy(callIx, c, fnIx)
  }
  const d = identDeclOf(c.callFn)
  const dn = if d >= 0 && d < P.nodes.length { nodeAt(d) } else { null }
  if !(dn is LetDecl || dn is Param || dn is LoopVar) { return "decl " + censusNodeKind(d) }
  if identCallArmOf(c, callee, fnIx) != "userFn" { return "builtin arm" }
  if cloTailRefusal(callIx, fnIx) != "" { return "legacy refusal" }
  if fnTagArmsAt(callIx, emitTagSetAt(callIx, fnIx)).length > 0 { return "tag arms" }
  if holderRecordSigs(d, fnIx).length > 0 { return "holder" }
  if !userFnCallRoutesRef(c, callee, fnIx, userFnCallTarget(c, callee, fnIx)) {
    return "not routed to a closure"
  }
  if bundleParamOfRead(c.callFn, fnIx) >= 0 { return "bundle" }
  if topLambdaRecordFe(c.callFn) >= 0 { return "top-level lambda record" }
  return censusTailWhy(callIx, c, fnIx)
}

function censusTailWhy(callIx: i32, c: Call, fnIx: i32): string {
  if cloLiftCalleeOf(c.callFn, fnIx) >= 0 { return "lifted" }
  if exprNulClosure(c.callFn, fnIx) { return "nullable callee" }
  const ckey = cloCallSigKey(callIx, fnIx)
  if ckey == "" { return "no key" }
  if cloCallUnionResultUnrepresentable(callIx, fnIx) { return "union result" }
  if cloCallReflistElemTwin(callIx, fnIx) { return "ref list twin" }
  if cloSigTypeIdxAt(cloSigPosOfKey(ckey)) < 0 { return "no signature type" }
  const n = c.callArgs.length
  if n > 0 && sigParamKindAt(ckey, n - 1) == null { return "parameter count" }
  if fnTagCallSplits(callIx) && !fnTagSetIsTagged(fnTagCallSetOf(callIx)) { return "tag split" }
  if closureCallSetSplits(nodeTyAt(c.callFn, fnIx), elabSrcDecl(fnIx)) { return "set split" }
  let i = 0
  while i < n {
    const a = c.callArgs[i]
    if emitBundleRecordRead(a, fnIx) { return "argument bundle record" }
    if callRefBundleArgOf(c, fnIx, ckey, i).bbTy < 0 && !callRefArgPlain(callIx, fnIx, ckey, a, i) {
      const k = sigParamKindAt(ckey, i)
      const ks: string = if k == null { "?" } else { k }
      return "argument " + callRefArgArmOf(callIx, fnIx, ckey, a, i) + " " + censusNodeKind(a) + " at " + ks
    }
    i = i + 1
  }
  const rk = sigKeyRetKind(ckey)
  if (rk == "f64" || rk == "i64" || rk == "f32") && exprScalarWidth(callIx, fnIx) == "i32" {
    return "narrower result"
  }
  return "no refusal found"
}
WHY
awk '
  /^    if callRefPlainKey\(ix, ibFnIx\) == "" \{ return missRhs\("indirect call"\) \}$/ {
    print "    if callRefPlainKey(ix, ibFnIx) == \"\" { return missRhs(\"indirect call: \" + censusPlainWhy(ix, ibFnIx)) }"; e1 = 1; next
  }
  /^    return missRhs\("call of a non-declaration"\)$/ && !e2 {
    print "    return missRhs(\"call of a non-declaration: \" + (if d < 0 { \"unbound name\" } else { \"decl \" + censusNodeKind(d) }))"; e2 = 1; next
  }
  /^  if key == "" \{ return missRhs\("call of a non-declaration"\) \}$/ {
    print "  if key == \"\" { return missRhs(\"call of a non-declaration: \" + censusPlainWhy(ix, ibFnIx)) }"; e3 = 1; next
  }
  /^ *(if sel == null \{ )?return missRhs\("intrinsic " \+ pl.niArm\)( \})?$/ {
    sub(/missRhs\("intrinsic " \+ pl.niArm\)/, "missRhs(\"intrinsic \" + pl.niArm + \" \" + f.identName)"); print; e4 = 1; next
  }
  /^  callRefPlainKey,$/ { print; print "  censusNodeKind,"; print "  censusPlainWhy,"; e5 = 1; next }
  { print }
  END { if (!e1 || !e2 || !e3 || !e4 || !e5) { print "ir-i8-census: a call split anchor in ir_build.vl was not found" > "/dev/stderr"; exit 1 } }
' "$T/probe/ir_build.vl" > "$T/ir_build.vl"
mv "$T/ir_build.vl" "$T/probe/ir_build.vl"
"$VL" build "$T/probe/entry.vl" -o "$T/probe.wasm" --compiler "$SEED" > /dev/null

rm -rf "$OUT/wit"
"$VL" run scripts/ir-i8-census/witnesses.vl -- "$OUT/wit" docs/internals/inventory docs/internals/inventory-2 > "$T/witnesses"
ls scripts/silent-sweep/distilled/cells/*.vl scripts/silent-sweep/distilled/named/*.vl > "$T/distilled"
find tests/cases -name '*.vl' | sort > "$T/cases"
ls scripts/capability-probes/*.vl > "$T/probes"
if [ -n "${CENSUS_CLASS:-}" ]; then
  for pop in distilled cases probes witnesses; do
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
for pop in distilled cases probes witnesses; do
  xargs -r -n 100 -P "$JOBS" env VL="$VL" PROBE="$T/probe.wasm" sh "$T/one.sh" < "$T/$pop" > "$OUT/$pop.rows" || true
  wc -l < "$T/$pop" > "$OUT/$pop.programs"
done
cat "$T/distilled" "$T/cases" "$T/probes" "$T/witnesses" > "$OUT/programs.txt"

scripts/ir-i8-census/summary.sh "$OUT" | tee "$OUT/summary.txt"
