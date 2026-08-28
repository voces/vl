#!/usr/bin/env python3
"""The D199 grid: a union ARM at a FUNCTION-VALUE boundary, and the receiver it is read through.

The population `silent-class-inventory` D201 says does not exist. That row is titled "the
corpus cannot witness this family at all", and it is still true: the distilled corpus (1,477
derived classes standing for 250,775 census cells, plus 537 curated) moves **0 cells** for
every rung this grid scores, and a corpus `cmp` over 1,923 buildable modules is byte-identical
apart from the three fixtures the rows own. So the family has to be BUILT to be measured, and
this is the build.

    python3 scripts/silent-sweep/d199/gen199.py /tmp/g199
    JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py /tmp/g199 <seed.wasm> /tmp/x.json

**The expectation is the GENERATOR's, never a compiler's**: every cell prints `7`, and the
two two-callee shapes print `7` twice.

## Axes

- **`shape`** — the boundary and the spelling. Four groups:
  * `hof2` / `hofret` — TWO higher-order callees, each annotated for its own arm-or-twin name
    and each handed its own lambda: the `$fnsig` key's PARAM leg and its RESULT leg (D199).
  * `hofcross` / `bindcross` — ONE arm-typed callee handed a closure minted under the TWIN's
    spelling, inline and through an annotated binding: the same key seam with the two sides
    forced to meet.
  * `vcall_narrow` / `vcall_objlit` / `vcall_bind` / `dcall_narrow` — the value-call ARM
    PARAMETER (D269, direction 2 of D200), with the arm-annotated binding and the DIRECT call
    as the two controls that run on every compiler.
  * `read_bare` / `read_paren` / `read_paren2` / `read_bare_path` / `read_paren_path` — a
    narrowed union receiver read with and without parentheses (D222). One paren is the whole
    difference, which makes the control free.
- **`twin`** — what else claims the arm's layout: `arm` (a second UNION's arm of the same
  shape — the `uVarTwin` merge), `decl` (a declared plain struct — D280's cross-table merge),
  `none`. The four two-name shapes need a second name and SKIP `twin=none`.
- **`fld`** — the arm's field storage: `i32`, `two` (two i32 fields), `str` (i32 + string).
- **`order`** — declaration order of the type block, so no number depends on which row of a
  twin pair is the canonical one.

## Resource discipline

`JOBS` defaults to **6** and nothing here raises it.
"""
import json
import os
import sys
from collections import Counter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# fld -> (body, literal)
FLD = {
    "i32": ("{ r: i32 }", "{ r: 7 }"),
    "two": ("{ r: i32, q: i32 }", "{ r: 7, q: 1 }"),
    "str": ("{ r: i32, s: string }", '{ r: 7, s: "a" }'),
}
TWO_NAME = ("hof2", "hofret", "hofcross", "bindcross")
SHAPES = list(TWO_NAME) + [
    "vcall_narrow", "vcall_objlit", "vcall_bind", "dcall_narrow",
    "read_bare", "read_paren", "read_paren2", "read_bare_path", "read_paren_path",
]
TWINS = ["arm", "decl", "none"]
ORDERS = ["norm", "rev"]


def gen_one(shape, twin, fld, order):
    body, lit = FLD[fld]
    decls = ["type Circle = " + body, "type Sq = { z: i32 }", "type Shape = Circle | Sq"]
    tw = ""
    if twin == "arm":
        # A second UNION's arm of the same layout — the `uVarTwin` merge.
        tw = "Kot"
        decls += ["type Kot = " + body, "type Sq2 = { w: i32 }", "type Other = Kot | Sq2"]
    elif twin == "decl":
        # A declared plain struct of the arm's exact layout — D280's cross-table merge.
        tw = "Dot"
        decls += ["type Dot = " + body]
    if shape in ("read_bare_path", "read_paren_path"):
        decls += ["type Holder = { v: Shape }"]
    if order == "rev":
        decls.reverse()
    L = list(decls)

    if shape == "hof2":
        L += [
            "const c0: Circle = " + lit,
            "const t0: %s = %s" % (tw, lit),
            "function viaA(f: (Circle) => Circle, x: Circle) { print(f(x).r) }",
            "function viaB(g: (%s) => %s, y: %s) { print(g(y).r) }" % (tw, tw, tw),
            "viaA((p: Circle) => p, c0)",
            "viaB((q: %s) => q, t0)" % tw,
        ]
        return "\n".join(L) + "\n", "7\n7"
    if shape == "hofret":
        L += [
            "const c0: Circle = " + lit,
            "const t0: %s = %s" % (tw, lit),
            "function viaA(f: (i32) => Circle) { print(f(0).r) }",
            "function viaB(g: (i32) => %s) { print(g(0).r) }" % tw,
            "viaA((p: i32) => c0)",
            "viaB((q: i32) => t0)",
        ]
        return "\n".join(L) + "\n", "7\n7"
    if shape == "hofcross":
        L += [
            "const c0: Circle = " + lit,
            "function viaA(f: (Circle) => Circle, x: Circle) { print(f(x).r) }",
            "viaA((q: %s) => q, c0)" % tw,
        ]
        return "\n".join(L) + "\n", "7"
    if shape == "bindcross":
        L += [
            "const c0: Circle = " + lit,
            "function viaA(f: (Circle) => Circle, x: Circle) { print(f(x).r) }",
            "const g: (%s) => %s = (q: %s) => q" % (tw, tw, tw),
            "viaA(g, c0)",
        ]
        return "\n".join(L) + "\n", "7"
    if shape == "vcall_narrow":
        L += [
            "const lamc = (x: Circle) => x",
            "function m3(s: Shape) { if s is Circle { lamc(s).r } else { 0 } }",
            "print(m3(%s))" % lit,
        ]
        return "\n".join(L) + "\n", "7"
    if shape == "vcall_objlit":
        L += ["const lamc = (x: Circle) => x", "print(lamc(%s).r)" % lit]
        return "\n".join(L) + "\n", "7"
    if shape == "vcall_bind":
        L += [
            "const c0: Circle = " + lit,
            "const lamc = (x: Circle) => x",
            "print(lamc(c0).r)",
        ]
        return "\n".join(L) + "\n", "7"
    if shape == "dcall_narrow":
        L += [
            "function idc(x: Circle): Circle { x }",
            "function m3(s: Shape) { if s is Circle { idc(s).r } else { 0 } }",
            "print(m3(%s))" % lit,
        ]
        return "\n".join(L) + "\n", "7"
    if shape in ("read_bare", "read_paren", "read_paren2"):
        recv = {"read_bare": "v", "read_paren": "(v)", "read_paren2": "((v))"}[shape]
        L += [
            "function f(v: Shape) { if v is Circle { print(%s.r) } }" % recv,
            "f(%s)" % lit,
        ]
        return "\n".join(L) + "\n", "7"
    if shape in ("read_bare_path", "read_paren_path"):
        recv = "t.v" if shape == "read_bare_path" else "(t.v)"
        L += [
            "function f(t: Holder) { if t.v is Circle { print(%s.r) } }" % recv,
            "f({ v: %s })" % lit,
        ]
        return "\n".join(L) + "\n", "7"
    raise SystemExit("unknown shape " + shape)


def main():
    expect, coords, skips = {}, {}, {}
    for shape in SHAPES:
        for twin in TWINS:
            for fld in FLD:
                for order in ORDERS:
                    coord = "%s_%s_%s_%s" % (shape, twin, fld, order)
                    # Named by COORDINATE, not by index: a named set materialised out of this
                    # grid keeps its names when a later axis is added, and `mkset.py`'s
                    # staleness check then means what it says.
                    name = "d199_" + coord
                    if twin == "none" and shape in TWO_NAME:
                        skips[name] = coord + " (needs a second name)"
                        continue
                    src, exp = gen_one(shape, twin, fld, order)
                    open(os.path.join(OUT, name + ".vl"), "w").write(src)
                    expect[name] = exp
                    coords[name] = coord
    json.dump({"expect": expect, "coords": coords, "skips": skips, "block": "d199",
               "generated": len(expect)},
              open(os.path.join(OUT, "manifest.json"), "w"))
    print("generated %d cells into %s (%d skipped)" % (len(expect), OUT, len(skips)))
    print(Counter(c.split("_")[0] for c in coords.values()))


main()
