#!/usr/bin/env python3
"""Which of D155–D158 the census actually REACHES, and how big each is inside it.

Each open row is turned into a coordinate PREDICATE over the census axes — read off the
row's own filed repro, not off its title — and the census is asked how many cells at that
coordinate are silent.  A row whose census population is 0 silent is a row the census
refutes at that coordinate; a row whose population is far larger than filed is a row whose
filed population was scoped to the grid that found it.

Usage: rows.py <celldir> <graded.json> [<celldir> <graded.json> ...]
"""
import json
import sys
from collections import Counter

SILENT = ("runs but wrong value", "check-clean invalid wasm", "compiler trap", "trap_loads")

cells = {}
for i in range(1, len(sys.argv), 2):
    d = sys.argv[i]
    man = json.load(open(d + "/manifest.json"))
    res = json.load(open(sys.argv[i + 1]))
    for k, co in man["coords"].items():
        co.setdefault("annpat", "outer")
        if k in res:
            cells[(d, k)] = (co, res[k]["class"])

# Each predicate is read off the row's FILED REPRO.
ROWS = {
    "D155 arm-valued map from a CALL":
        lambda c: (c["cont"] == "mapval" and c["store"] == "callres"
                   and c["twin"] in ("exact", "armtwin", "late")
                   and c["union"] != "nounion"),
    "D156 NESTED arm-valued map":
        lambda c: (c["cont"] in ("nestedmap", "map3")
                   and c["twin"] in ("exact", "armtwin", "late")
                   and c["union"] != "nounion"),
    "D157 a std or generic CONDUIT":
        lambda c: (c["deliv"] in ("std", "generic")
                   and c["twin"] in ("exact", "armtwin", "late")
                   and c["union"] != "nounion"),
    "D158 the annotation is at the READ site":
        lambda c: (c["annpos"] == "readsite"
                   and c["cont"] in ("nestedmap", "map3")),
    # the negative controls the four rows share: no twin at all, and no union at all
    "[control] no twin anywhere":
        lambda c: c["twin"] == "none",
    "[control] no union anywhere":
        lambda c: c["union"] == "nounion",
    "[control] no twin AND no union AND no claim":
        lambda c: c["twin"] == "none" and c["union"] == "nounion" and c["claim"] == "0",
    "[control] NO type declaration of the payload at all":
        lambda c: c["declness"] == "nodecl",
    "[control] no twin, no union, no claim, no declaration":
        lambda c: (c["twin"] == "none" and c["union"] == "nounion"
                   and c["claim"] == "0" and c["declness"] == "nodecl"),
}

print("%-46s %8s %8s %7s" % ("row / control", "silent", "cells", "rate"))
for name, pred in ROWS.items():
    ks = [k for k, (co, cls) in cells.items() if pred(co)]
    sil = [k for k in ks if cells[k][1] in SILENT]
    print("%-46s %8d %8d %6.1f%%" %
          (name, len(sil), len(ks), 100.0 * len(sil) / max(1, len(ks))))
    if sil:
        cc = Counter(cells[k][1] for k in sil)
        print("      classes: " + ", ".join("%s=%d" % kv for kv in cc.most_common()))
        # the axes that VARY inside the silent population of this row
        AX = ["store", "escope", "declness", "twin", "union", "claim", "cont",
              "annpos", "deliv", "pval", "order", "rep"]
        con = {a: sorted({cells[k][0][a] for k in sil}) for a in AX}
        fixed = [f"{a}={v[0]}" for a, v in con.items() if len(v) == 1]
        print("      constant across its silent cells: " + (", ".join(fixed) or "(nothing)"))
