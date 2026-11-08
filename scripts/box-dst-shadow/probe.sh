#!/bin/bash
# Patch a copy of compiler/ ($1) into the box-destination shadow's probe: the shadow armed and
# naming its rows, each row printed as a late demand (`elabShadowNote`, which run.sh appends to
# emit_elab.vl), and each call of the three box helpers tagged `<function>:<line>`. Applied by
# run.sh to a copy, never to the tree; refuses when an anchor has moved.
set -euo pipefail
C="$1"
B="$C/box_dst_shadow.vl"
sed -i 's|^import { tyHasTyVar } from "./tyquery"$|&\nimport { elabShadowNote } from "./emit_elab"|;
  s|^let bdsArmed = false$|let bdsArmed = true|;
  s|^let bdsNamed = false$|let bdsNamed = true\nlet bdsPos = ""|' "$B"
awk '/^  bdsCount\(key\)$/ { print; print "  elabShadowNote(\"bds \" + key + \" | pos \" + bdsPos)"; next } { print }' \
  "$B" > "$B.t" && mv "$B.t" "$B"
cat >> "$B" <<'X'

export function bdsPosEnter(p: string): string {
  const o = bdsPos
  if o == "" { bdsPos = p }
  o
}

export function bdsPosLeave(o: string) {
  bdsPos = o
  0
}
X
for f in wasmEmit.vl emit_sections.vl; do
  perl -i -pe '
    $fn = $1 if /^\s*(?:export )?function (\w+)/;
    s/\b(emitUnionBoxArg|emitUnionCoerce|emitUnionBoxAtRecord|emitUnionBoxOwed|emitAtomToStr|emitNarrowedArmUnboxTo|armClose)\(/$1P("$fn:$.", /g
      unless /function (?:emit(?:UnionBoxArg|UnionCoerce|UnionBoxAtRecord|UnionBoxOwed|AtomToStr|NarrowedArmUnboxTo)|armClose)\(/;' "$C/$f"
done
# A floor (`emitUnionBoxOwed` boxing at the site, the record owing no box) is tagged `floor@<pos>`;
# its class names why (`boxFloorWhy`), and a table delivery's class is `table`.
perl -0 -i -pe 's/(\n  if boxOwedAt\(valIx, fnIx\) \{ return emitDelivered\(body, valIx, fnIx\) \}\n  if boxDstShadowArmed\(\) \{ boxDstShadowAs\(boxFloorWhy\(valIx, fnIx\)\) \}\n)  (emitUnionBoxArgP\("[^"]*", body, siteNm, siteTy, valIx, fnIx\))\n/$1  const fo = bdsPosEnter("")\n  bdsPosLeave("floor@" + fo)\n  const fr = $2\n  bdsPosLeave(fo)\n  fr\n/' "$C/wasmEmit.vl"
W="$C/wasmEmit.vl"
awk '!done && /^} from "\.\/box_dst_shadow"$/ { print "  bdsPosEnter,"; print "  bdsPosLeave,"; done = 1 } { print }' \
  "$W" > "$W.t" && mv "$W.t" "$W"
for h in emitUnionBoxArg emitUnionCoerce emitUnionBoxAtRecord emitUnionBoxOwed; do
  cat >> "$W" <<X

export function ${h}P(pos: string, body: u8[], a: string, b: i32, c: i32, d: i32): i32 {
  const o = bdsPosEnter(pos)
  const r = ${h}(body, a, b, c, d)
  bdsPosLeave(o)
  r
}
X
done
# The read side: an atom-to-string decode and a narrowed-arm unbox, tagged the same way, graded by
# `atomSrcShadowNote` / `armSrcShadowNote` against the source and arm records.
cat >> "$W" <<X

export function emitAtomToStrP(pos: string, body: u8[], a: i32, b: i32): i32 {
  const o = bdsPosEnter(pos)
  const r = emitAtomToStr(body, a, b)
  bdsPosLeave(o)
  r
}

function emitNarrowedArmUnboxToP(pos: string, h: i32, a: i32, b: i32): i32 {
  const o = bdsPosEnter(pos)
  const r = emitNarrowedArmUnboxTo(h, a, b)
  bdsPosLeave(o)
  r
}

function armCloseP(pos: string, p: i32, w: boolean, h: i32, a: i32, b: i32): i32 {
  const o = bdsPosEnter(pos)
  const r = armClose(p, w, h, a, b)
  bdsPosLeave(o)
  r
}
X
E="$C/emit_sections.vl"
awk '!done && /^  emitUnionBoxOwed,$/ { print; print "  emitUnionBoxOwedP,"; done = 1; next } { print }' \
  "$E" > "$E.t" && mv "$E.t" "$E"
awk '!done && /^  emitAtomToStr,$/ { print; print "  emitAtomToStrP,"; done = 1; next } { print }' \
  "$E" > "$E.t" && mv "$E.t" "$E"
need() { grep -qF -- "$2" "$C/$1" || { echo "probe.sh: anchor for \`$2\` not found in $1; re-anchor" >&2; exit 1; }; }
need box_dst_shadow.vl 'elabShadowNote("bds '
need box_dst_shadow.vl 'let bdsArmed = true'
need box_dst_shadow.vl 'import { elabShadowNote }'
need wasmEmit.vl 'emitUnionBoxArgP("'
need wasmEmit.vl '  bdsPosEnter,'
need wasmEmit.vl 'bdsPosLeave("floor@" + fo)'
need emit_sections.vl '  emitUnionBoxOwedP,'
need emit_sections.vl '  emitAtomToStrP,'
need wasmEmit.vl 'emitNarrowedArmUnboxToP("'
need wasmEmit.vl 'emitAtomToStrP("'
need wasmEmit.vl 'armCloseP("'
need emit_sections.vl 'emitUnionBoxOwedP("'
# --- overwrite history (appended to probe.sh) ---
K="$C/check_elab_cap.vl"
cat >> "$K" <<'Y'

// Probe only: every union a node's box record was written with, in order, per scope.
export let bxwCap: {[i32]: i32[]} = Map()
export let bxwInst: {[string]: i32[]} = Map()

export function bxwReset() {
  bxwInst = Map()
  0
}

export function bxwNote(ix: i32, t: i32, inst: boolean) {
  const h = bxwCap[ix] ?? []
  h.push(t)
  bxwCap[ix] = h
  0
}

export function bxwBank(k: i32) {
  for ix in bxwCap.keys() {
    bxwInst[i32ToStr(ix) + ":" + i32ToStr(k)] = bxwCap[ix] ?? []
  }
  bxwCap = Map()
  0
}


export function bxwInstOf(ix: i32, k: i32): i32[] {
  bxwInst[i32ToStr(ix) + ":" + i32ToStr(k)] ?? []
}
Y
CS="$C/check_core_state.vl"
cat >> "$CS" <<'Y'

// Probe only: every union node ix's program box record was written with, in order.
export let bxwHist: {[i32]: i32[]} = Map()

export function bxwNoteProg(ix: i32, t: i32) {
  const h = bxwHist[ix] ?? []
  h.push(t)
  bxwHist[ix] = h
  0
}

export function bxwHistOf(ix: i32): i32[] { bxwHist[ix] ?? [] }

// The recorder writing now: 0 a contextual stamp, 1 a `??` join (`recordBoxTy`), 2 loop exits.
export let bxwRole = 0

export function bxwRoleSet(r: i32): i32 {
  const o = bxwRole
  bxwRole = r
  o
}
Y
perl -0 -i -pe 's/(\n  nodeBoxTyIx = \[\]\n)/$1  bxwHist = Map()\n/' "$CS"
perl -0 -i -pe 's/(export function elabCapBegin\(depth: i32\) \{\n)/$1  bxwCap = Map()\n/' "$K"
F="$C/check_fit_rules.vl"
perl -0 -i -pe 's/(\n  nodeBoxTyIx,\n)/\n  bxwNoteProg,\n  bxwRole,\n  bxwRoleSet,\n  nodeBoxTyIx,\n/; s/(\} from "\.\/check_elab_cap"\n)/  bxwNote,\n$1/;
  s/(\n    elabCapBox\[ix\] = t\n    elabCapBoxJoin\[ix\] = boxJoinWrite\n)/$1    bxwNote(ix, t * 4 + bxwRole, true)\n/;
  s/(  nodeBoxTyIx\[ix\] = t\n)/$1  bxwNoteProg(ix, t * 4 + bxwRole)\n/;
  s/(  const spine: i32\[\] = \[\]\n  const leaves: i32\[\] = \[\]\n  valueTailSplit\(ix, spine, leaves\)\n  boxTyStamp\(ix, t\)\n  for j in spine \{ boxTyStamp\(j, t\) \}\n  for l in leaves \{ boxTyStamp\(l, t\) \}\n)/  const bxo = bxwRoleSet(1)\n$1  bxwRoleSet(bxo)\n/;
  s/(function boxExitsStamp\(ix: i32, t: i32\): i32 \{\n)(.*?\n)(  0\n\})/$1  const bxo = bxwRoleSet(2)\n$2  bxwRoleSet(bxo)\n$3/s' "$F"
EL="$C/emit_elab.vl"
perl -0 -i -pe 's/(\} from "\.\/check_elab_cap"\n)/  bxwBank,\n  bxwReset,\n$1/;
  s/(  for ix in elabCapBox\.keys\(\) \{\n)/  bxwBank(k)\n$1/; s/(\n  elabNodeBoxs = Map\(\)\n)/$1  bxwReset()\n/' "$EL"
need check_fit_rules.vl 'bxwNoteProg(ix, t * 4 + bxwRole)'
need check_fit_rules.vl '  const bxo = bxwRoleSet(1)'
need check_fit_rules.vl '  const bxo = bxwRoleSet(2)'
need check_fit_rules.vl '    bxwNote(ix, t * 4 + bxwRole, true)'
need emit_elab.vl '  bxwBank(k)'
need emit_elab.vl '  bxwReset()'
need check_elab_cap.vl '  bxwCap = Map()'
need check_core_state.vl '  bxwHist = Map()'
B="$C/box_dst_shadow.vl"
perl -0 -i -pe 's/(" \| record " \+ col)/$1 + bdsHist(unionName, unionTy, ix, fnIx)/;
  s/^(import \{ tyHasTyVar \} from "\.\/tyquery"\n)/$1import { bxwHistOf, nodeBoxTyIxOf } from ".\/check_core_state"\nimport { bxwInstOf } from ".\/check_elab_cap"\nimport { elabKeyAt, elabNodeBoxAt } from ".\/emit_elab"\nimport { tyCarrySrcOf } from ".\/check_node_tys"\n/m' "$B"
cat "$(dirname "$0")/hist.vl.in" >> "$B"
need box_dst_shadow.vl 'bdsHist(unionName, unionTy, ix, fnIx)'
need box_dst_shadow.vl 'import { bxwInstOf }'
