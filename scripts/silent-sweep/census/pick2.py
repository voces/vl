#!/usr/bin/env python3
"""Pull the exact census cells behind the families whose hand-trimmed witnesses moved."""
import json
import os

BLOCKS = (("cellsA", "A"), ("cellsB", "B"), ("cellsC", "C"),
          ("cellsD", "D"), ("cellsE", "E"))
AX = ("store", "escope", "declness", "twin", "union", "claim", "cont", "annpos",
      "deliv", "pval", "order", "rep", "annpat")
SILENT = ("runs but wrong value", "check-clean invalid wasm", "compiler trap", "trap_loads")

WANT = {
    # the no-declarations nested-list family, at each container depth
    "L2_nodecl": lambda c, m: (c["cont"] == "listlist" and c["declness"] == "nodecl"
                               and c["twin"] == "none" and c["union"] == "nounion"
                               and c["claim"] == "0"),
    "L3_nodecl": lambda c, m: (c["cont"] == "list3" and c["declness"] == "nodecl"
                               and c["twin"] == "none" and c["union"] == "nounion"
                               and c["claim"] == "0"),
    # an unrelated union + a std conduit over a payload with no object in it
    "std_unrelated_union": lambda c, m: (c["deliv"] == "std" and c["union"] != "nounion"
                                         and c["rep"] in ("scalar", "string")
                                         and c["twin"] == "none" and c["claim"] == "0"),
    # list_of_map, the hottest container, with the fewest ingredients
    "lom_min": lambda c, m: (c["cont"] == "list_of_map" and c["twin"] == "none"
                             and c["union"] == "nounion" and c["claim"] == "0"
                             and c["pval"] != "nullfield"),
    "lom_claim": lambda c, m: (c["cont"] == "list_of_map" and c["twin"] == "none"
                               and c["union"] == "nounion" and c["claim"] != "0"),
    # nothing declared at all, anywhere
    "bare_min": lambda c, m: (c["declness"] == "nodecl" and c["twin"] == "none"
                              and c["union"] == "nounion" and c["claim"] == "0"
                              and c["cont"] not in ("forin",)),
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
    print("=" * 26, t, "%d bytes" % n, cls, "->", p)
    print("   " + ", ".join("%s=%s" % (a, co[a]) for a in AX))
    print("   " + m[:110])
    print(open(p).read())
for t in WANT:
    if t not in best:
        print("=" * 26, t, "NO SILENT CELL IN THE CENSUS")
