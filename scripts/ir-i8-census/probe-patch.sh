#!/usr/bin/env bash
# Patches a copy of compiler/ (the dir $1) into the I8 census's probe: one `[ir]` row per function
# under `$VL_IR_SHADOW=5`, `fnc <name>` claimed, `fnr <name> | <refusal>` declined on a refusal it
# met, and `fnu <name> | <miss>` otherwise, with the `is rung`,
# rep-miss and call classes split by rung, node kind and sub-reason. census.sh and ir-i8-sweep.sh
# build their probe compilers from it. Exits 1 when an anchor in ir_build.vl is not found.
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
  # A refusal the claim met is `fnr <name> | <refusal>` (census.sh keeps it only where the program
  # expects that refusal); any other fallback is `fnu`.
  /^    count\("claim fell back: " \+ why\)$/ {
    print
    print "    if why.indexOf(\"a legacy helper refused in \") == 0 && why.indexOf(\"`: \") > 0 {"
    print "      count(\"fnr \" + ib.irName + \" | \" + why.slice(why.indexOf(\"`: \") + 3, why.length))"
    print "    } else {"
    print "      count(\"fnu \" + ib.irName + \" | claim fell back: \" + why)"
    print "    }"
    b++; next
  }
  /^  count\("claimed"\)$/ { print; print "  count(\"fnc \" + ib.irName)"; c = 1; next }
  # The fallbacks that count no `claim fell back: " + why` row: the verifier (a function and a
  # start body), a minted synthetic global, and a legacy helper refusing (`softRefused`).
  /^  count\("claim fell back: verifier"\)$/ { print; print "  count(\"fnu \" + ib.irName + \" | claim fell back: verifier\")"; v++; next }
  /^  count\("claim fell back: build minted a synthetic global"\)$/ { print; print "  count(\"fnu \" + ib.irName + \" | claim fell back: build minted a synthetic global\")"; m = 1; next }
  /^function softRefused\(what: string\): boolean \{$/ { sr = 1 }
  sr && /^  return true$/ { print "  count(\"fnr \" + ib.irName + \" | \" + emitSoftMsg)"; sr = 0; r = 1 }
  { print }
  END { if (!a || b != 2 || !c || v != 1 || !m || !r) { print "ir-i8-census: a probe anchor in ir_build.vl was not found" > "/dev/stderr"; exit 1 } }
' "$D/ir_build.vl" > "$D/ir_build.vl.new"
mv "$D/ir_build.vl.new" "$D/ir_build.vl"
# Two classes split for the census alone: `is rung` names its rung, and a miss at a node with no
# rep (`repMissAt`) names the node's kind. The shipped compiler's classes stay unsplit.
grep -q '^  if arm != "variant" && arm != "armTag" { return irBMiss("is rung") }$' "$D/ir_build.vl" \
  && grep -q '^function repMissAt(_ix: i32, miss: string): Opnd { return irBMiss(miss) }$' "$D/ir_build.vl" \
  || { echo "ir-i8-census: a split anchor in ir_build.vl was not found" >&2; exit 1; }
sed -i -e 's|^  if arm != "variant" \&\& arm != "armTag" { return irBMiss("is rung") }$|  if arm != "variant" \&\& arm != "armTag" { return irBMiss("is rung " + arm) }|' \
  -e 's|^function repMissAt(_ix: i32, miss: string): Opnd { return irBMiss(miss) }$|function repMissAt(_ix: i32, miss: string): Opnd { return irBMiss(miss + " of " + irAstKind(_ix)) }|' "$D/ir_build.vl"
# The call classes split the same way (COV-CALL): `call of a non-declaration` and `indirect call`
# name why `callRefPlainKey` refused (`censusPlainWhy`, a copy of its ladder) or the callee's
# shape, and `intrinsic <arm>` names the intrinsic.
cat >> "$D/wasmEmit.vl" <<'WHY'

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
' "$D/ir_build.vl" > "$D/ir_build.vl.new"
mv "$D/ir_build.vl.new" "$D/ir_build.vl"
