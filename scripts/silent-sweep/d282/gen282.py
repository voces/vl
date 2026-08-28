#!/usr/bin/env python3
"""The D282 grid: the ANONYMOUS claimant of a union arm's layout.

The axis no earlier grid has. D156's `twin` axis is binary — *is an exact layout twin
DECLARED* (`type Dot = { r: i32 }`) — and its `notwin` leg means "nothing else claims the
arm's layout". That is not true of the programs D282 lives in: an interned `#anonN` row,
minted by `collectAnonShapes` from an object literal the context could not name, is a
claimant of exactly the same layout, and `repSlotOfTy` (the DECLARED-row bridge D280's
`variantStructHeapTwinAt` keys on) cannot see it. So `twin=notwin` mixes "no claimant" with
"an anonymous claimant", and this grid separates them.

    python3 scripts/silent-sweep/d282/gen282.py   /tmp/d282cells
    JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d282cells <seed.wasm> /tmp/x.json

`grade88.py` is reused verbatim (one grader across D88/D112/D156/D282 is what makes their
residues comparable). `JOBS` defaults to 6 and nothing here raises it.

**The expectation is computed HERE, never by the compiler**: every cell prints exactly `7`.

## Axes

- **`prod`** — where the ANONYMOUS literal is produced and held: `mapparam` (D282's own —
  a map filled through an UN-ANNOTATED parameter), `maplocal`, `listlocal`, `globalbare`,
  `fnret`. The producer is what mints the `#anon` row.
- **`use`** — WHERE the one nominal claim on the arm sits: `plain` (nowhere), `readdef`
  (the `??` default, D282's coordinate — map producers only), `bindarm` (a binding),
  `paramarm` (a callee parameter), `retarm` (a declared result), `boxarm` (into the union,
  then `is`-narrowed back — the DISCRIMINATION control, which is what a heap merge can
  break and a byte-diff cannot show).
- **`claim`** — `none` (the anon row is the arm's ONLY layout-mate: the rung under test)
  or `decl` (`type Dot = { r: i32 }` also declared, so D280's own rung already answers and
  this one must be inert).
- **`fld`** — the arm's field storage: `i32`, `two` (two i32 fields), `str` (an i32 and a
  string field). All three print `.r`.
- **`order`** — declaration order of the type block.

`use=readdef` needs a `??`, which only the map producers have; those 36 cells are SKIPPED
rather than emitted as a different program under the same name.
"""
import json
import os
import sys
from collections import Counter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# fld -> (arm body, twin body, literal with %s for the value, second-arm body)
FLD = {
    "i32": ("{ r: i32 }",              "{ r: %s }"),
    "two": ("{ r: i32, q: i32 }",      "{ r: %s, q: 1 }"),
    "str": ("{ r: i32, s: string }",   "{ r: %s, s: \"a\" }"),
}
PRODS = ["mapparam", "maplocal", "listlocal", "globalbare", "fnret"]
USES = ["plain", "readdef", "bindarm", "paramarm", "retarm", "boxarm"]
CLAIMS = ["none", "decl"]
ORDERS = ["norm", "rev"]
MAPPROD = ("mapparam", "maplocal")


def gen_one(prod, use, claim, fld, order):
    body, lit = FLD[fld]
    decls = [
        "type Circle = " + body,
        "type Sq = { z: i32 }",
        "type Shape = Circle | Sq",
    ]
    if claim == "decl":
        decls.append("type Dot = " + body)
    if order == "rev":
        decls.reverse()
    L = list(decls)

    # ── the producer: mints the anonymous row, and hands back a READ expression ──
    dflt = "dleaf" if use == "readdef" else (lit % "0")
    if prod == "mapparam":
        L += ["function fill(c, n: i32) {", "  c[\"k1\"] = " + (lit % "n"), "}",
              "const c = Map()", "fill(c, 7)"]
        read = "((c)[\"k1\"] ?? %s)" % dflt
    elif prod == "maplocal":
        L += ["const c = Map()", "c[\"k1\"] = " + (lit % "7")]
        read = "((c)[\"k1\"] ?? %s)" % dflt
    elif prod == "listlocal":
        L += ["const xs = [" + (lit % "7") + "]"]
        read = "(xs[0])"
    elif prod == "globalbare":
        L += ["const v = " + (lit % "7")]
        read = "(v)"
    else:  # fnret
        L += ["function mk(n: i32) { return " + (lit % "n") + " }"]
        read = "(mk(7))"

    if use == "readdef":
        L.append("const dleaf: Circle = " + (lit % "0"))

    # ── the consumer: WHERE the nominal claim sits ────────────────────────────
    if use in ("plain", "readdef"):
        L.append("print((%s).r)" % read)
    elif use == "bindarm":
        L.append("const w: Circle = %s" % read)
        L.append("print(w.r)")
    elif use == "paramarm":
        L.append("function take(x: Circle) { return x.r }")
        L.append("print(take(%s))" % read)
    elif use == "retarm":
        L.append("function g(): Circle { return %s }" % read)
        L.append("print(g().r)")
    else:  # boxarm — the DISCRIMINATION control
        L.append("const sh: Shape = %s" % read)
        L.append("if sh is Circle { print(sh.r) } else { print(0) }")
    return "\n".join(L) + "\n"


skips = Counter()
expect, coords = {}, {}
n = 0
for prod in PRODS:
    for use in USES:
        for claim in CLAIMS:
            for fld in FLD:
                for order in ORDERS:
                    if use == "readdef" and prod not in MAPPROD:
                        skips["use=readdef needs a `??`, which only a map producer has"] += 1
                        continue
                    name = "%s_%s_%s_%s_%s.vl" % (prod, use, claim, fld, order)
                    open(os.path.join(OUT, name), "w").write(
                        gen_one(prod, use, claim, fld, order))
                    stem = name[:-3]
                    expect[stem] = "7"
                    coords[stem] = {"prod": prod, "use": use, "claim": claim,
                                    "fld": fld, "order": order}
                    n += 1
# The manifest `gradecensus.py` reads, and the coord table `d243/mkset.py` checks a named
# set against — the expectation is the GENERATOR's (every cell prints 7), never a compiler's.
json.dump({"expect": expect, "coords": coords, "skips": dict(skips), "block": "d282",
           "generated": n}, open(os.path.join(OUT, "manifest.json"), "w"),
          indent=1, sort_keys=True)
print("cells:", n)
for k in sorted(skips):
    print("  skip %5d  %s" % (skips[k], k))
