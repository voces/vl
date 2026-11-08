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
    s/\b(emitUnionBoxArg|emitUnionCoerce|emitUnionBoxAtRecord)\(/$1P("$fn:$.", /g
      unless /function emit(?:UnionBoxArg|UnionCoerce|UnionBoxAtRecord)\(/;' "$C/$f"
done
W="$C/wasmEmit.vl"
awk '!done && /^} from "\.\/box_dst_shadow"$/ { print "  bdsPosEnter,"; print "  bdsPosLeave,"; done = 1 } { print }' \
  "$W" > "$W.t" && mv "$W.t" "$W"
for h in emitUnionBoxArg emitUnionCoerce emitUnionBoxAtRecord; do
  cat >> "$W" <<X

export function ${h}P(pos: string, body: u8[], a: string, b: i32, c: i32, d: i32): i32 {
  const o = bdsPosEnter(pos)
  const r = ${h}(body, a, b, c, d)
  bdsPosLeave(o)
  r
}
X
done
E="$C/emit_sections.vl"
awk '!done && /^  emitUnionBoxArg,$/ { print; print "  emitUnionBoxArgP,"; print "  emitUnionCoerceP,"; done = 1; next } { print }' \
  "$E" > "$E.t" && mv "$E.t" "$E"
need() { grep -qF -- "$2" "$C/$1" || { echo "probe.sh: anchor for \`$2\` not found in $1; re-anchor" >&2; exit 1; }; }
need box_dst_shadow.vl 'elabShadowNote("bds '
need box_dst_shadow.vl 'let bdsArmed = true'
need box_dst_shadow.vl 'import { elabShadowNote }'
need wasmEmit.vl 'emitUnionBoxArgP("'
need wasmEmit.vl '  bdsPosEnter,'
need emit_sections.vl '  emitUnionBoxArgP,'
need emit_sections.vl 'emitUnionCoerceP("'
