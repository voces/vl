#!/usr/bin/env python3
"""The D3125/D3126 named set's grid: a `.map` over a pinned element whose inline callback builds
only at the instance's pin (a return join, or a null test the pin folds), across nine receivers
and ten delivery positions, in generic, hole and plain functions, at six pins. The #3280 round-4
review graded it (14,580 cells) against a candidate that lifted master's `bare null needs a
struct-typed context` refusal and gated the deliveries it could not build: 224 cells that run on
master were refused or broken, and 297 master refusals went silent. Writes the `manifest.json`
`d243/mkset.py` reads (`coords`, `expect`).

    python3 scripts/silent-sweep/d3125/gen.py /tmp/d3125grid
    python3 scripts/silent-sweep/d243/mkset.py /tmp/d3125set \\
        scripts/silent-sweep/census/d3125-lift-price.json /tmp/d3125grid
"""
import itertools
import json
import os
import sys

PINS = [("i32", "4", "4"), ("i32 | null", "null", "null"), ("i32 | null", "4", "4"),
        ("string | null", "null", "null"), ("f64", "2.5", "2.5"), ("i32 | string", "4", "4")]


def isnull(pv):
    return pv == "null"


CB = {
    "J2": ('if e == null { return "n" }\n    return e', lambda pv: "n" if isnull(pv) else pv, "y"),
    "K1": ('if 1 > 2 { return e }\n    return "k"', lambda pv: "k", "y"),
    "K2": ('if 1 > 2 { return "k" }\n    return e', lambda pv: pv, "y"),
    "K4": ("if 1 > 2 { return e }\n    return 1.5", lambda pv: "1.5", "y"),
    "J1": ("if e != null { return e }\n    return null", lambda pv: pv, "y"),
    "K12": ("if 1 > 2 { return e }\n    return null", lambda pv: "null", "y"),
    "F2": ('if e == null { return "n" }\n    return "v"', lambda pv: "n" if isnull(pv) else "v", "y"),
    "FR": ("if e == null { return { q: 0 } }\n    return { q: 3 }",
           lambda pv: "0" if isnull(pv) else "3", "y.q"),
    "S3": ("if 1 > 2 { return 1 }\n    return 2", lambda pv: "2", "y"),
}
RECV = {
    "A": ("", "[x]", 1), "B": ("  const r = [x]\n", "r", 1), "C": ("", "[x, x]", 2),
    "D": ("", "[...[x]]", 1), "E": ("", "[x, ...[x]]", 2), "F": ("", "mk(x)", 1),
    "G": ("", "mkh(x)", 1), "H": ("", "[x].filter((e) => true)", 1),
    "I": ("  const r = [x]\n", "[...r]", 1),
}
POS = {
    "P0": ("  const n = {M}\n  for y in n {{ print({Y}) }}\n", False, "all"),
    "P1": ("  let n = {M}\n  n = {M}\n  for y in n {{ print({Y}) }}\n", False, "all"),
    "P2": ("  return {M}\n", True, "all"),
    "P3": ("  {M}\n", True, "all"),
    "P4": ("  const c = 1 > 0\n  const n = if c {{ {M} }} else {{ {M} }}\n  for y in n {{ print({Y}) }}\n",
           False, "all"),
    "P6": ("  const c = 1 > 0\n  return if c {{ {M} }} else {{ {M} }}\n", True, "all"),
    "P9": ("  for y in {M} {{ print({Y}) }}\n", False, "all"),
    "P10": ("  const y = {M}[0]\n  print({Y})\n", False, "one"),
    "P12": ("  const n = idh({M})\n  for y in n {{ print({Y}) }}\n", False, "all"),
    "P13": ("  const c = 1 > 0\n  if c {{ {M} }} else {{ {M} }}\n", True, "all"),
}
PRE = ("function mk<U>(v: U): U[] {\n  return [v]\n}\nfunction mkh(v) {\n  return [v]\n}\n"
       "function idh(v) {\n  return v\n}\n")

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
coords, expect = {}, {}
for form, (cn, (cb, f, y)), (rn, (setup, recv, cnt)), (pn, (tpl, ret, mode)), (i, (p, v, pv)) in \
        itertools.product(("gen", "hole", "plain"), CB.items(), RECV.items(), POS.items(), enumerate(PINS)):
    m = "%s.map((e) => {\n    %s\n  })" % (recv, cb)
    hdr = {"gen": "function t<T>(x: T) {", "hole": "function t(x) {", "plain": "function t(x: %s) {" % p}[form]
    src = PRE + hdr + "\n" + setup + tpl.format(M=m, Y=y) + "}\n" + "const a: %s = %s\n" % (p, v)
    src += ("for y in t(a) { print(%s) }\n" % y) if ret else "t(a)\n"
    k = 1 if mode == "one" else cnt
    name = "d3125_%s_%s_%s_%s_%d" % (form, cn, rn, pn, i)
    open(os.path.join(out, name + ".vl"), "w").write(src)
    coords[name] = {"form": form, "cb": cn, "recv": rn, "pos": pn, "pin": i}
    expect[name] = "\n".join([f(pv)] * k)
json.dump({"coords": coords, "expect": expect, "block": "d3125", "generated": len(coords)},
          open(os.path.join(out, "manifest.json"), "w"), indent=1, sort_keys=True)
print("wrote %d cells into %s" % (len(coords), out))
