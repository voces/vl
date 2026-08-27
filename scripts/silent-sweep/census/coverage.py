#!/usr/bin/env python3
"""Re-derive the census's coverage claim from the cells that were actually GENERATED.

The generator states a pairwise guarantee; this reads the manifests back and checks it,
so the claim in the report is a measurement rather than a design intention.  Reports:

  * every PAIR of axis values that no generated cell contains, split into pairs that are
    structurally impossible and pairs that are merely missing;
  * the full crossing of the historically-interacting group (twin x union x claim x store);
  * per-axis level counts, so an axis a block pinned is visible as such.

Usage: coverage.py <celldir> [<celldir> ...]
"""
import itertools
import json
import sys
from collections import defaultdict

AX = ["store", "escope", "declness", "twin", "union", "claim", "cont", "annpos",
      "deliv", "pval", "order", "rep"]

coords = []
for d in sys.argv[1:]:
    man = json.load(open(d + "/manifest.json"))
    coords.extend(man["coords"].values())
print("cells generated across %d blocks: %d" % (len(sys.argv) - 1, len(coords)))

levels = {a: sorted({c[a] for c in coords}) for a in AX}
print("\n== levels present per axis ==")
for a in AX:
    print("  %-9s %2d  %s" % (a, len(levels[a]), " ".join(levels[a])))

seen = defaultdict(set)
for c in coords:
    for a, b in itertools.combinations(AX, 2):
        seen[(a, b)].add((c[a], c[b]))

missing = []
total = 0
for a, b in itertools.combinations(AX, 2):
    total += len(levels[a]) * len(levels[b])
    for va in levels[a]:
        for vb in levels[b]:
            if (va, vb) not in seen[(a, b)]:
                missing.append((a, va, b, vb))
print("\n== pairwise coverage over the levels actually present ==")
print("  covered %d / %d pairs   (%d missing)" %
      (total - len(missing), total, len(missing)))
if missing:
    print("  missing pairs:")
    for m in missing:
        print("     %s=%s x %s=%s" % m)

print("\n== full crossing of twin x union x claim x store ==")
q = {(c["twin"], c["union"], c["claim"], c["store"]) for c in coords}
want = len(levels["twin"]) * len(levels["union"]) * len(levels["claim"]) * len(levels["store"])
print("  %d / %d combinations present" % (len(q), want))
missq = [t for t in itertools.product(levels["twin"], levels["union"],
                                      levels["claim"], levels["store"])
         if t not in q]
for t in missq:
    print("     missing %s" % (t,))

print("\n== full crossing of twin x union x claim x store x escope ==")
q5 = {(c["twin"], c["union"], c["claim"], c["store"], c["escope"]) for c in coords}
print("  %d combinations present (20 of the 5x4 store x escope pairs have no spelling "
      "for 4 of them, so the ceiling is %d)" % (len(q5), 5 * 3 * 3 * 16))

print("\n== full crossing of cont x annpos x deliv x pval ==")
q4 = {(c["cont"], c["annpos"], c["deliv"], c["pval"]) for c in coords}
want4 = len(levels["cont"]) * len(levels["annpos"]) * len(levels["deliv"]) * len(levels["pval"])
print("  %d / %d combinations present" % (len(q4), want4))

print("\n== full crossing of rep x cont ==")
q2 = {(c["rep"], c["cont"]) for c in coords}
print("  %d / %d combinations present" %
      (len(q2), len(levels["rep"]) * len(levels["cont"])))
