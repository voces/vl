#!/usr/bin/env python3
"""Minimise the compiler trap block D found, and the block-D annotation-pattern family."""
import json
import os
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
F, E = {}, {}


def add(k, v, e="7"):
    F[k] = v
    E[k] = e


U = "type Cir2 = { c2: i32 }\ntype Sq2 = { s2: i32 }\ntype Shape2 = Cir2 | Sq2\n"

# ── the compiler trap ────────────────────────────────────────────────────────
add("CT_asfiled", U + '''function rd() {
  const c = [{ r: { c2: 1 } }]
  let hit = 0
  for zz in c {
    if zz.r is Cir2 { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("CT_mod", U + '''const c = [{ r: { c2: 1 } }]
let hit = 0
for zz in c {
  if zz.r is Cir2 { hit = 7 }
}
print(hit)
''')
add("CT_index", U + '''function rd() {
  const c = [{ r: { c2: 1 } }]
  if c[0].r is Cir2 { print(7) } else { print(0) }
}
rd()
''')
add("CT_annotated", U + '''type Circle = { r: Shape2 }
function rd() {
  const c: Circle[] = [{ r: { c2: 1 } }]
  let hit = 0
  for zz in c {
    if zz.r is Cir2 { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("CT_nolist", U + '''function rd() {
  const c = { r: { c2: 1 } }
  if c.r is Cir2 { print(7) } else { print(0) }
}
rd()
''')
add("CT_noarm", '''type Inner = { q: i32 }
function rd() {
  const c = [{ r: { q: 7 } }]
  let hit = 0
  for zz in c {
    if zz.r.q == 7 { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("CT_armdirect", U + '''function rd() {
  const c = [{ c2: 1 }]
  let hit = 0
  for zz in c {
    if zz is Cir2 { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("CT_forin_scalar", U + '''function rd() {
  const c = [{ r: 1 }]
  let hit = 0
  for zz in c {
    if zz.r == 1 { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("CT_map", U + '''function rd() {
  const c = Map()
  c["k"] = { r: { c2: 1 } }
  const g = c["k"] ?? { r: { s2: 1 } }
  if g.r is Cir2 { print(7) } else { print(0) }
}
rd()
''')

# ── the intermediate-annotation family, minimal ──────────────────────────────
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
'''
for pat, l2, l1 in (("none", "", ""), ("outer", "", ""), ("inner", ": string[]", ""),
                    ("mid", "", ": string[][]"),
                    ("all", ": string[]", ": string[][]")):
    outer = "" if pat == "none" else ": string[][][]"
    add("AP_%s" % pat, 'function rd() {\n  const lv2%s = ["seven"]\n  const lv1%s = [lv2]\n'
        '  const c%s = [lv1]\n' % (l2, l1, outer) + RD3 + "}\nrd()\n")

for k, v in F.items():
    open(os.path.join(OUT, k + ".vl"), "w").write(v)
json.dump({"expect": E, "coords": {k: {} for k in E}},
          open(os.path.join(OUT, "manifest.json"), "w"))
print("cells:", len(F))
