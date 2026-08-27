#!/usr/bin/env python3
"""Pull the SMALLEST silent cell matching each candidate-family predicate, so a row is
filed against the tree's own program rather than a retyped paraphrase."""
import json
import os

BLOCKS = (("cellsA", "A"), ("cellsB", "B"), ("cellsC", "C"),
          ("cellsD", "D"), ("cellsE", "E"))
AX = ("store", "escope", "declness", "twin", "union", "claim", "cont", "annpos",
      "deliv", "pval", "order", "rep", "annpat")
SILENT = ("runs but wrong value", "check-clean invalid wasm", "compiler trap", "trap_loads")

WANT = {
    "nullfield": lambda c, m: c["pval"] == "nullfield",
    "mono_m0": lambda c, m: "$m0" in m,
    "listofmap_clean": lambda c, m: (c["cont"] == "list_of_map" and c["claim"] == "0"
                                     and c["twin"] == "none" and c["union"] == "nounion"),
    "nothing_declared": lambda c, m: (c["declness"] == "nodecl" and c["twin"] == "none"
                                      and c["union"] == "nounion" and c["claim"] == "0"),
    "std_bare": lambda c, m: c["deliv"] == "std" and c["cont"] == "bare",
    "claim_only": lambda c, m: (c["claim"] != "0" and c["twin"] == "none"
                                and c["union"] == "nounion"),
    "twin_only": lambda c, m: (c["twin"] != "none" and c["union"] == "nounion"
                               and c["claim"] == "0"),
    "union_only": lambda c, m: (c["union"] != "nounion" and c["twin"] == "none"
                                and c["claim"] == "0"),
    "expect_i32": lambda c, m: "expected i32, found (ref" in m,
    "forin": lambda c, m: c["cont"] == "forin",
    "structfield_any": lambda c, m: c["cont"].startswith("structfield"),
}

best = {}
for d, j in BLOCKS:
    man = json.load(open("scratch-silent/census/%s/manifest.json" % d))
    res = json.load(open("scratch-silent/census/%s.json" % j))
    for k, co in man["coords"].items():
        co.setdefault("annpat", "outer")
        r = res.get(k)
        if not r or r["class"] not in SILENT:
            continue
        p = "scratch-silent/census/%s/%s.vl" % (d, k)
        n = os.path.getsize(p)
        for tag, pred in WANT.items():
            if pred(co, r["msg"]) and (tag not in best or n < best[tag][1]):
                best[tag] = (p, n, co, r["msg"], r["class"])

for t in sorted(best):
    p, n, co, m, cls = best[t]
    print("=" * 26, t, "%d bytes" % n, cls)
    print("   " + ", ".join("%s=%s" % (a, co[a]) for a in AX))
    print("   " + m[:120])
    print(open(p).read())
