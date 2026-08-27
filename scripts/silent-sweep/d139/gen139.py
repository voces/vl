#!/usr/bin/env python3
"""The axis neither the D88 nor the D112 grid varies: WHERE THE MAP IS BOUND.

#1962's D131 found its real discriminator by varying the RECEIVER's storage class after
four filed controls all agreed. The analogue here is the map's own binding: every cell of
both grids builds it as a function LOCAL. D139's own control table already shows the axis
bites (a module-scope sibling of a running program is silent), so a fix at the slot layer
has to be graded against it — a cell that moves BACKWARD at a storage class no grid covers
would be invisible otherwise.

Axes: decl (arm / armdiff / armtwin) x bind (local / global / callres) x cont
(mapval / nestedmap) x route (none / std). Every cell prints exactly 7.
"""
import os, sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

DOT = {"arm": "", "armdiff": "type Dot = { q: i32 }\n", "armtwin": "type Dot = { r: i32 }\n"}

def prelude(decl, std):
    s = 'import { reverse } from "std:array"\n' if std else ""
    s += "type Circle = { r: i32 }\ntype Sq = { s: i32 }\ntype Shape = Circle | Sq\n"
    s += DOT[decl]
    return s

def wrap(expr, std):
    return f"reverse([{expr}])[0]" if std else expr

n = 0
for decl in ("arm", "armdiff", "armtwin"):
    for cont in ("mapval", "nestedmap"):
        for route in ("none", "std"):
            std = route == "std"
            for bind in ("local", "global", "callres"):
                p = prelude(decl, std)
                if cont == "mapval":
                    p += "function thru(x: {[string]: Circle}) { return x }\n"
                    build = "  const c = Map()\n  c[\"k\"] = { r: n }\n"
                    gbuild = "const c = Map()\nc[\"k\"] = { r: 7 }\n"
                    read = '(RECV["k"] ?? { r: 0 }).r'
                else:
                    p += "function thru(x: {[string]: {[string]: Circle}}) { return x }\n"
                    build = ("  const i0 = Map()\n  i0[\"k\"] = { r: n }\n"
                             "  const c = Map()\n  c[\"o\"] = i0\n")
                    gbuild = ("const i0 = Map()\ni0[\"k\"] = { r: 7 }\n"
                              "const c = Map()\nc[\"o\"] = i0\n")
                    read = '((RECV["o"] ?? Map())["k"] ?? { r: 0 }).r'
                if bind == "local":
                    p += f"function mk(n: i32) {{\n{build}  return {wrap('thru(c)', std)}\n}}\n"
                    p += f"print({read.replace('RECV', '(mk(7))')})\n"
                elif bind == "global":
                    p += gbuild
                    p += f"const t = {wrap('thru(c)', std)}\n"
                    p += f"print({read.replace('RECV', 't')})\n"
                else:  # callres — the map comes back from a call, then is handed on
                    p += f"function mkm(n: i32) {{\n{build}  return c\n}}\n"
                    p += f"const t2 = {wrap('thru(mkm(7))', std)}\n"
                    p += f"print({read.replace('RECV', 't2')})\n"
                name = f"{decl}_{cont}_{route}_{bind}.vl"
                open(os.path.join(OUT, name), "w").write(p)
                n += 1
print("cells:", n)
