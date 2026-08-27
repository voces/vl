#!/usr/bin/env python3
"""Final candidate rows D179–D186.

Each WITNESS is the census's own cell, verbatim (the file it came from is named in the
comment); each CONTROL changes exactly ONE thing from that witness and keeps everything
else — including the scope, which moved three witnesses on the first attempt at trimming
them by hand.
"""
import json
import os
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
F, E = {}, {}


def add(k, v, e="7"):
    F[k] = v
    E[k] = e


U2 = "type Cir2 = { c2: i32 }\ntype Sq2 = { s2: i32 }\ntype Shape2 = Cir2 | Sq2\n"

# ══ D179 — cellsD/d005521.vl : COMPILER TRAP ═════════════════════════════════════
D179 = U2 + '''const c = [{ r: { c2: 1 } }]
let hit = 0
for zz in c {
  if zz.r is Cir2 { hit = 7 }
}
print(hit)
'''
add("D179_witness", D179)
add("D179_c_fnscope", U2 + "function rd() {\n" +
    "".join("  " + l + "\n" for l in D179[len(U2):].strip().split("\n")) + "}\nrd()\n")
add("D179_c_index", U2 + 'const c = [{ r: { c2: 1 } }]\n'
    'if c[0].r is Cir2 { print(7) } else { print(0) }\n')
add("D179_c_declared", U2 + "type Circle = { r: Shape2 }\nconst c: Circle[] = [{ r: { c2: 1 } }]\n"
    "let hit = 0\nfor zz in c {\n  if zz.r is Cir2 { hit = 7 }\n}\nprint(hit)\n")
add("D179_c_noarm", "type Inner = { q: i32 }\nconst c = [{ r: { q: 7 } }]\n"
    "let hit = 0\nfor zz in c {\n  if zz.r.q == 7 { hit = 7 }\n}\nprint(hit)\n")
add("D179_c_armdirect", U2 + "const c = [{ c2: 1 }]\nlet hit = 0\n"
    "for zz in c {\n  if zz is Cir2 { hit = 7 }\n}\nprint(hit)\n")
add("D179_c_map", U2 + 'const c = Map()\nc["k"] = { r: { c2: 1 } }\n'
    'const g = c["k"] ?? { r: { s2: 1 } }\n'
    'if g.r is Cir2 { print(7) } else { print(0) }\n')

# ══ D180 — cellsD/d001795.vl : a nested list, NOTHING declared, inside a function ═
RD2 = '''  const g0 = c
  if g0.length > 0 {
    const g1 = g0[0]
    if g1.length > 0 {
      if (g1[0]) == "seven" { print(7) } else { print(0) }
    } else { print(0) }
  } else { print(0) }
}
rd()
'''
add("D180_witness", 'function rd() {\n  const lv1 = ["seven"]\n  const c = [lv1]\n' + RD2)
add("D180_c_modscope", 'const lv1 = ["seven"]\nconst c = [lv1]\n' +
    RD2.replace("  ", "", 1).replace("\n  ", "\n").replace("}\nrd()\n", ""))
add("D180_c_outerann",
    'function rd() {\n  const lv1 = ["seven"]\n  const c: string[][] = [lv1]\n' + RD2)
add("D180_c_innerann",
    'function rd() {\n  const lv1: string[] = ["seven"]\n  const c = [lv1]\n' + RD2)
add("D180_c_bothann",
    'function rd() {\n  const lv1: string[] = ["seven"]\n'
    '  const c: string[][] = [lv1]\n' + RD2)
add("D180_c_oneliteral", 'function rd() {\n  const c = [["seven"]]\n' + RD2)
add("D180_c_i32", 'function rd() {\n  const lv1 = [7]\n  const c = [lv1]\n'
    + RD2.replace('== "seven"', "== 7"))

# ══ D180b — cellsC/c041175.vl : depth 3, only the MIDDLE annotation rescues ══════
RD3 = '''  const g0 = c
  if g0.length > 0 {
    const g1 = g0[0]
    if g1.length > 0 {
      const g2 = g1[0]
      if g2.length > 0 {
        if (g2[0]) == "seven" { print(7) } else { print(0) }
      } else { print(0) }
    } else { print(0) }
  } else { print(0) }
}
rd()
'''
add("D180b_witness", 'function rd() {\n  const lv2 = ["seven"]\n  const lv1 = [lv2]\n'
    '  const c: string[][][] = [lv1]\n' + RD3)
add("D180b_c_midann", 'function rd() {\n  const lv2 = ["seven"]\n'
    '  const lv1: string[][] = [lv2]\n  const c: string[][][] = [lv1]\n' + RD3)
add("D180b_c_innerann", 'function rd() {\n  const lv2: string[] = ["seven"]\n'
    '  const lv1 = [lv2]\n  const c: string[][][] = [lv1]\n' + RD3)
add("D180b_c_allann", 'function rd() {\n  const lv2: string[] = ["seven"]\n'
    '  const lv1: string[][] = [lv2]\n  const c: string[][][] = [lv1]\n' + RD3)
add("D180b_c_oneliteral", 'function rd() {\n  const c: string[][][] = [[["seven"]]]\n' + RD3)

# ══ D181 — cellsC/c039831.vl : a container ALIAS plus one value of it ════════════
RDLM = '''function rd() {
  const g0 = c
  if g0.length > 0 {
    const g1 = (g0[0])["k0"] ?? 0
    if (g1) == 7 { print(7) } else { print(0) }
  } else { print(0) }
}
rd()
'''
BODY = 'const lv1 = Map()\nlv1["k0"] = 7\nconst c: {[string]: i32}[] = [lv1]\n' + RDLM
add("D181_witness", "type Box1 = {[string]: i32}[]\nconst _sp1: Box1 = []\n" + BODY)
add("D181_c_noalias", BODY)
add("D181_c_aliasonly", "type Box1 = {[string]: i32}[]\n" + BODY)
add("D181_c_spareonly", "const _sp1: {[string]: i32}[] = []\n" + BODY)
add("D181_c_innerann", "type Box1 = {[string]: i32}[]\nconst _sp1: Box1 = []\n"
    'const lv1: {[string]: i32} = Map()\nlv1["k0"] = 7\n'
    'const c: {[string]: i32}[] = [lv1]\n' + RDLM)
add("D181_c_mapval", "type Box1 = {[string]: i32}\nconst _sp1: Box1 = Map()\n"
    'const c: {[string]: i32} = Map()\nc["k0"] = 7\n'
    'const g0 = c["k0"] ?? 0\nif g0 == 7 { print(7) } else { print(0) }\n')
add("D181_c_twoaliases", "type Box1 = {[string]: i32}[]\ntype Box2 = {[string]: i32}[]\n"
    "const _sp1: Box1 = []\nconst _sp2: Box2 = []\n" + BODY)

# ══ D182 — a struct with a NULLABLE FIELD in a container ═════════════════════════
add("D182_witness", '''type Circle = { r: i32 | null }
type WS1 = { f: {[string]: Circle} }
const lv1 = Map()
lv1["k0"] = { r: null }
const c: WS1 = { f: lv1 }
const g1 = (c.f)["k0"] ?? { r: null }
if g1.r != null { print(7) } else { print(0) }
''', "0")
add("D182_c_innerann", '''type Circle = { r: i32 | null }
type WS1 = { f: {[string]: Circle} }
const lv1: {[string]: Circle} = Map()
lv1["k0"] = { r: null }
const c: WS1 = { f: lv1 }
const g1 = (c.f)["k0"] ?? { r: null }
if g1.r != null { print(7) } else { print(0) }
''', "0")
add("D182_c_plainfield", '''type Circle = { r: i32 }
type WS1 = { f: {[string]: Circle} }
const lv1 = Map()
lv1["k0"] = { r: 7 }
const c: WS1 = { f: lv1 }
const g1 = (c.f)["k0"] ?? { r: 0 }
if g1.r == 7 { print(7) } else { print(0) }
''')
add("D182_c_mapval", '''type Circle = { r: i32 | null }
const c: {[string]: Circle} = Map()
c["k0"] = { r: null }
const g1 = c["k0"] ?? { r: null }
if g1.r != null { print(7) } else { print(0) }
''', "0")
add("D182_c_listofmap", '''type Circle = { r: i32 | null }
const lv1 = Map()
lv1["k0"] = { r: null }
const c: {[string]: Circle}[] = [lv1]
const g0 = c
if g0.length > 0 {
  const g1 = (g0[0])["k0"] ?? { r: null }
  if g1.r != null { print(7) } else { print(0) }
} else { print(0) }
''', "0")

# ══ D183 — cellsA/a007648.vl : an UNRELATED union + a std conduit over string[] ══
STD = 'import { reverse } from "std:array"\n'
UN = "type Shape = Ua | Sq\ntype Ua = { ua: i32 }\ntype Sq = { s: i32 }\n"
SINK = "function sink(_x: string[]) { }\n"
BOD = '''function rd() {
  const c = ["seven", ""]
  sink(c)
  const dd = reverse([c])[0]
  let hit = 0
  for zz in dd {
    if zz == "seven" { hit = 7 }
  }
  print(hit)
}
rd()
'''
add("D183_witness", STD + UN + SINK + BOD)
add("D183_c_nounion", STD + SINK + BOD)
add("D183_c_nosink", STD + UN + BOD.replace("  sink(c)\n", ""))
add("D183_c_nostd", UN + SINK + BOD.replace("reverse([c])[0]", "c").replace(STD, ""))
add("D183_c_oneelem", STD + UN + SINK + BOD.replace('["seven", ""]', '["seven"]'))
add("D183_c_modscope", STD + UN + SINK +
    'const c = ["seven", ""]\nsink(c)\nconst dd = reverse([c])[0]\nlet hit = 0\n'
    'for zz in dd {\n  if zz == "seven" { hit = 7 }\n}\nprint(hit)\n')

# ══ D184 — list-of-list of a declared union-arm object with an exact twin ════════
HEADO = ("type Circle = { r: i32 }\ntype Sq = { s: i32 }\n"
         "type Shape = Circle | Sq\ntype Dot = { r: i32 }\n")
RDLL = '''const g0 = c
if g0.length > 0 {
  const g1 = g0[0]
  if g1.length > 0 {
    if g1[0].r == 7 { print(7) } else { print(0) }
  } else { print(0) }
} else { print(0) }
'''
add("D184_witness", HEADO + "const lv1 = [{ r: 7 }]\nconst c: Circle[][] = [lv1]\n" + RDLL)
add("D184_c_notwin", "type Circle = { r: i32 }\ntype Sq = { s: i32 }\n"
    "type Shape = Circle | Sq\nconst lv1 = [{ r: 7 }]\nconst c: Circle[][] = [lv1]\n" + RDLL)
add("D184_c_nounion", "type Circle = { r: i32 }\ntype Dot = { r: i32 }\n"
    "const lv1 = [{ r: 7 }]\nconst c: Circle[][] = [lv1]\n" + RDLL)
add("D184_c_diffname", "type Circle = { r: i32 }\ntype Sq = { s: i32 }\n"
    "type Shape = Circle | Sq\ntype Dot = { q: i32 }\n"
    "const lv1 = [{ r: 7 }]\nconst c: Circle[][] = [lv1]\n" + RDLL)
add("D184_c_innerann", HEADO + "const lv1: Circle[] = [{ r: 7 }]\n"
    "const c: Circle[][] = [lv1]\n" + RDLL)
add("D184_c_oneliteral", HEADO + "const c: Circle[][] = [[{ r: 7 }]]\n" + RDLL)
add("D184_c_flat", HEADO + "const c: Circle[] = [{ r: 7 }]\n"
    'if c.length > 0 { if c[0].r == 7 { print(7) } else { print(0) } } else { print(0) }\n')

# ══ D185 — struct field over a map of a union arm: LOUD without the twin ════════
RDS = '''const g1 = (c.f)["k0"] ?? { r: 0 }
if g1.r == 7 { print(7) } else { print(0) }
'''
SFBODY = 'const lv1 = Map()\nlv1["k0"] = { r: 7 }\nconst c: WS1 = { f: lv1 }\n' + RDS
add("D185_witness", HEADO + "type WS1 = { f: {[string]: Circle} }\n" + SFBODY)
add("D185_c_notwin", "type Circle = { r: i32 }\ntype Sq = { s: i32 }\n"
    "type Shape = Circle | Sq\ntype WS1 = { f: {[string]: Circle} }\n" + SFBODY)
add("D185_c_diffname", "type Circle = { r: i32 }\ntype Sq = { s: i32 }\n"
    "type Shape = Circle | Sq\ntype Dot = { q: i32 }\n"
    "type WS1 = { f: {[string]: Circle} }\n" + SFBODY)
add("D185_c_nounion", "type Circle = { r: i32 }\ntype Dot = { r: i32 }\n"
    "type WS1 = { f: {[string]: Circle} }\n" + SFBODY)
add("D185_c_bare", "type Circle = { r: i32 }\ntype WS1 = { f: {[string]: Circle} }\n"
    + SFBODY)
add("D185_c_innerann", HEADO + "type WS1 = { f: {[string]: Circle} }\n"
    'const lv1: {[string]: Circle} = Map()\nlv1["k0"] = { r: 7 }\n'
    'const c: WS1 = { f: lv1 }\n' + RDS)

# ══ D186 — cellsD/d006871.vl : list_of_map of an UNDECLARED struct over a union arm
LMB = ('const lv1 = Map()\nlv1["k0"] = { r: { c2: 1 } }\n'
       'const c: {[string]: {r: Shape2}}[] = [lv1]\n'
       'const g0 = c\nif g0.length > 0 {\n'
       '  const g1 = (g0[0])["k0"] ?? { r: { s2: 1 } }\n'
       '  if (g1).r is Cir2 { print(7) } else { print(0) }\n} else { print(0) }\n')
add("D186_witness", U2 + LMB)
add("D186_c_declared", U2 + "type Circle = { r: Shape2 }\n" +
    LMB.replace("{[string]: {r: Shape2}}[]", "{[string]: Circle}[]"))
add("D186_c_innerann", U2 + 'const lv1: {[string]: {r: Shape2}} = Map()\n'
    'lv1["k0"] = { r: { c2: 1 } }\n' + LMB.split("\n", 2)[2])
add("D186_c_mapval", U2 + 'const c: {[string]: {r: Shape2}} = Map()\n'
    'c["k0"] = { r: { c2: 1 } }\n'
    'const g1 = c["k0"] ?? { r: { s2: 1 } }\n'
    'if (g1).r is Cir2 { print(7) } else { print(0) }\n')
add("D186_c_scalar", 'const lv1 = Map()\nlv1["k0"] = 7\n'
    'const c: {[string]: i32}[] = [lv1]\nconst g0 = c\nif g0.length > 0 {\n'
    '  const g1 = (g0[0])["k0"] ?? 0\n'
    '  if g1 == 7 { print(7) } else { print(0) }\n} else { print(0) }\n')

for k, v in F.items():
    open(os.path.join(OUT, k + ".vl"), "w").write(v)
json.dump({"expect": E, "coords": {k: {} for k in E}},
          open(os.path.join(OUT, "manifest.json"), "w"))
print("cells:", len(F))
