#!/usr/bin/env python3
"""The D2567 named set's grid: a lambda over `T` called in place, inside a generic bound at
`string | i32 | null`, in the two positions #3171's second review found (`iife`, `ret2`), with
and without an earlier `i32` instance and with a non-null and a null value. Reproduces the
eight cells of that review's `gen6.py` exactly, and writes the `manifest.json`
`d243/mkset.py` reads (`coords`, `expect`).

    python3 scripts/silent-sweep/d2567/genlam.py /tmp/d2567grid
    python3 scripts/silent-sweep/d243/mkset.py /tmp/d2567set \\
        scripts/silent-sweep/census/d2567-lambda-inplace-nuni.json /tmp/d2567grid
"""
import json
import os
import sys

PRE = """import { toString } from "std:fmt"
type Tex = { w: i32 }
function mkTex(): Tex { return { w: 3 } }
function inc(n: i32): i32 { return n + 1 }
function pickS(): string | null { return "z" }
function app<U>(f: () => U): U { return f() }
function app1<U>(f: (U) => U, v: U): U { return f(v) }
function rec<U>(n: i32, f: (U) => U, v: U): U {
  if n == 0 { return v }
  return rec(n - 1, f, f(v))
}
const gid = (x: i32) => x + 1
type LN = 1 | 2
function pLN(): LN | null { return 2 }
function pLNn(): LN | null { return null }
function pU(): string | i32 | null { return 7 }
function pUn(): string | i32 | null { return null }
function pB(): boolean | null { return true }
function pBn(): boolean | null { return null }
function pI(): i32 | null { return null }
function pR(): Tex | null { return null }
function pF(): f64 | null { return null }
function pFn(): () => string | null { return () => "k" }
function sU(v: string | i32 | null): string {
  if v == null { return "none" }
  if v is string { return v }
  return toString(v)
}
function sLN(v: LN | null): string {
  if v == null { return "none" }
  return toString(v)
}
function sB(v: boolean | null): string {
  if v == null { return "none" }
  return toString(v)
}
function sI(v: i32 | null): string {
  if v == null { return "none" }
  return toString(v)
}
function sF(v: f64 | null): string {
  if v == null { return "none" }
  return toString(v)
}
function sR(v: Tex | null): string {
  if v == null { return "none" }
  return toString(v.w)
}
"""

POS = {
    "iife": "return ((x: T) => x)(r)",
    "ret2": "if false { return ((x: T) => x)(r) }\n  return app(() => r)",
}
TYPES = {"i32": ("5", "toString({v})", "5"),
         "nuni": ("pU()", "sU({v})", "7"), "nuniN": ("pUn()", "sU({v})", "none")}

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
coords, expect = {}, {}
for p, body in POS.items():
    for t in ("nuni", "nuniN"):
        for first in ("i32", None):
            ts = [first, t] if first else [t]
            name = "d2567_" + p + "__" + "_".join(ts)
            src = PRE + "function gen<T>(r: T): T {\n  " + body + "\n}\n\n"
            exp = []
            for i, tt in enumerate(ts):
                lit, show, e = TYPES[tt]
                src += "const x%d = gen(%s)\nprint(%s)\n" % (i, lit, show.format(v="x" + str(i)))
                exp.append(e)
            open(os.path.join(out, name + ".vl"), "w").write(src)
            coords[name] = {"pos": p, "first": first or "none", "ty": t}
            expect[name] = "\n".join(exp)
json.dump({"coords": coords, "expect": expect, "block": "d2567", "generated": len(coords)},
          open(os.path.join(out, "manifest.json"), "w"), indent=1, sort_keys=True)
print("wrote %d cells into %s" % (len(coords), out))
