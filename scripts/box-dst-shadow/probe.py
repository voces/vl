# Patch a copy of compiler/ (argv[1]) into the box-destination shadow's probe: the shadow armed
# and naming its rows, each row printed as a late demand, and each call site of the three box
# helpers tagged `<function>:<line>`. Applied by run.sh to a copy, never to the tree.
import re,sys
C=sys.argv[1]
p=C+"/box_dst_shadow.vl"; s=open(p).read()
s=s.replace('import { tyHasTyVar } from "./tyquery"','import { tyHasTyVar } from "./tyquery"\nimport { elabShadowNote } from "./emit_elab"')
s=s.replace("let bdsArmed = false","let bdsArmed = true").replace("let bdsNamed = false","let bdsNamed = true\nlet bdsPos = \"\"")
s=s.replace("  bdsCount(key)\n  0\n}","  bdsCount(key)\n  elabShadowNote(\"bds \" + key + \" | pos \" + bdsPos)\n  0\n}")
s+='''
export function bdsPosEnter(p: string): string {
  const o = bdsPos
  if o == "" { bdsPos = p }
  o
}
export function bdsPosLeave(o: string) {
  bdsPos = o
  0
}
'''
open(p,"w").write(s)
helpers=["emitUnionBoxArg","emitUnionCoerce","emitUnionBoxAtRecord"]
for fn in ["wasmEmit.vl","emit_sections.vl"]:
  p=C+"/"+fn; lines=open(p).read().split("\n"); cur="?"; out=[]
  for i,l in enumerate(lines):
    m=re.match(r"\s*(export )?function (\w+)",l)
    if m: cur=m.group(2)
    for h in helpers:
      if re.search(r"function "+h+r"\(",l): continue
      l=re.sub(r"\b"+h+r"\(", h+'P("'+cur+':'+str(i+1)+'", ', l)
    out.append(l)
  s="\n".join(out)
  if fn=="wasmEmit.vl":
    s=s.replace('} from "./box_dst_shadow"','  bdsPosEnter,\n  bdsPosLeave,\n} from "./box_dst_shadow"',1)
    for h in helpers:
      s+='''
export function %sP(pos: string, body: u8[], a: string, b: i32, c: i32, d: i32): i32 {
  const o = bdsPosEnter(pos)
  const r = %s(body, a, b, c, d)
  bdsPosLeave(o)
  r
}
'''%(h,h)
  else:
    s=s.replace('  emitUnionBoxArg,\n','  emitUnionBoxArg,\n  emitUnionBoxArgP,\n  emitUnionCoerceP,\n',1)
  open(p,"w").write(s)
# Refuse a patch whose anchors moved, rather than build a probe that reports nothing.
for f, want in [("box_dst_shadow.vl", "elabShadowNote(\"bds "), ("box_dst_shadow.vl", "let bdsArmed = true"),
                ("wasmEmit.vl", "emitUnionBoxArgP(\""), ("wasmEmit.vl", "bdsPosEnter,"),
                ("emit_sections.vl", "emitUnionBoxArgP,")]:
  if want not in open(C + "/" + f).read():
    sys.exit("probe.py: anchor for `" + want + "` not found in " + f + "; re-anchor the patch")
