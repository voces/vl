#!/usr/bin/env python3
"""Name each silent cell's family by the ONE-STEP CHANGE that rescues it.

For every silent cell, look at all its one-axis siblings and record which (axis, value)
changes bring it back to `runs`.  Grouping silent cells by their rescue set names the
mechanism from the measurement instead of from a story: a cell rescued only by
`twin=none` is a twin cell; one rescued only by `annpat=mid` is an
intermediate-annotation cell; one with NO rescue in the grid is a cell whose family the
census located but did not bound.

Usage: rescue.py <celldir> <graded.json> [<celldir> <graded.json> ...]
"""
import json
import os
import sys
from collections import Counter, defaultdict

AX = ["store", "escope", "declness", "twin", "union", "claim", "cont", "annpos",
      "deliv", "pval", "order", "rep", "annpat"]
SILENT = ("runs but wrong value", "check-clean invalid wasm", "compiler trap", "trap_loads")

index, path = {}, {}
for i in range(1, len(sys.argv), 2):
    d = sys.argv[i]
    man = json.load(open(d + "/manifest.json"))
    res = json.load(open(sys.argv[i + 1]))
    for k, co in man["coords"].items():
        co.setdefault("annpat", "outer")
        if k not in res:
            continue
        t = tuple(co[a] for a in AX)
        if t not in index:
            index[t] = res[k]["class"]
            path[t] = os.path.join(d, k + ".vl")

levels = {a: sorted({t[i] for t in index}) for i, a in enumerate(AX)}
sil = [t for t, c in index.items() if c in SILENT]
print("silent coordinates: %d of %d" % (len(sil), len(index)))

groups = defaultdict(list)
norescue = []
for t in sil:
    resc = []
    for ai, a in enumerate(AX):
        for lv in levels[a]:
            if lv == t[ai]:
                continue
            s = t[:ai] + (lv,) + t[ai + 1:]
            if index.get(s) == "runs":
                resc.append("%s=%s" % (a, lv))
    if not resc:
        norescue.append(t)
        continue
    # the family key is the SET OF AXES that can rescue, not the values, so two cells
    # rescued by different levels of the same axis land together.
    key = tuple(sorted({r.split("=")[0] for r in resc}))
    groups[key].append((t, resc))

print("\n== silent cells grouped by WHICH AXES can rescue them ==")
print("%-46s %8s   %s" % ("rescuing axes", "cells", "example witness"))
for key, ts in sorted(groups.items(), key=lambda x: -len(x[1])):
    ex = min(ts, key=lambda x: os.path.getsize(path[x[0]]))
    print("%-46s %8d   %s (%d bytes)" %
          (",".join(key), len(ts), path[ex[0]], os.path.getsize(path[ex[0]])))
    cc = Counter()
    for t, r in ts:
        for x in r:
            cc[x] += 1
    print("      rescued by: " + ", ".join("%s x%d" % kv for kv in cc.most_common(8)))
    con = {a: sorted({t[AX.index(a)] for t, _ in ts}) for a in AX}
    fx = ["%s=%s" % (a, v[0]) for a, v in con.items() if len(v) == 1]
    print("      constant  : " + (", ".join(fx) or "(nothing)"))

print("\n== silent cells with NO one-step rescue inside the census ==")
print("   %d cells" % len(norescue))
if norescue:
    con = {a: sorted({t[AX.index(a)] for t in norescue}) for a in AX}
    for a in AX:
        print("     %-9s %s" % (a, " ".join(con[a])[:110]))
    ex = min(norescue, key=lambda t: os.path.getsize(path[t]))
    print("     smallest: %s (%d bytes)" % (path[ex], os.path.getsize(path[ex])))
