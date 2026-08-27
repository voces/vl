#!/usr/bin/env python3
"""Which axes MOVE an outcome, and which are inert.

For every pair of graded cells that differ in EXACTLY ONE axis, record whether the outcome
differs.  An axis that never changes an outcome across thousands of one-step siblings is
inert, and knowing that shrinks every future grid; an axis that changes it is where the
next grid has to spend its cells.  This is the paired reading `pairscope.py` introduced,
generalised from one axis to all twelve.

Usage: siblings.py <celldir> <graded.json> [<celldir> <graded.json> ...]
"""
import json
import sys
from collections import defaultdict

AX = ["store", "escope", "declness", "twin", "union", "claim", "cont", "annpos",
      "deliv", "pval", "order", "rep", "annpat"]
SILENT = ("runs but wrong value", "check-clean invalid wasm", "compiler trap", "trap_loads")

cells = {}
for i in range(1, len(sys.argv), 2):
    man = json.load(open(sys.argv[i] + "/manifest.json"))
    res = json.load(open(sys.argv[i + 1]))
    tag = sys.argv[i].rstrip("/").split("/")[-1]
    for k, co in man["coords"].items():
        co.setdefault("annpat", "outer")
        if k in res and all(a in co for a in AX):
            cells[(tag, k)] = (tuple(co[a] for a in AX), res[k]["class"])

index = {}
for key, (coord, cls) in cells.items():
    index.setdefault(coord, cls)

print("distinct coordinates: %d (from %d graded cells)" % (len(index), len(cells)))

flips = defaultdict(lambda: [0, 0])          # axis -> [differing, compared]
tosilent = defaultdict(lambda: [0, 0])       # axis -> [loud->silent moves, silent->loud]
detail = defaultdict(lambda: defaultdict(int))
# level sets come from the DATA, so an axis the blocks pinned reads as one level rather
# than as a covered axis with no effect.
AXLEVELS = {a: sorted({c[i] for c in index}) for i, a in enumerate(AX)}
print("levels seen per axis: " + ", ".join("%s=%d" % (a, len(AXLEVELS[a])) for a in AX))

for coord, cls in index.items():
    for ai, a in enumerate(AX):
        for lv in AXLEVELS[a]:
            if lv == coord[ai]:
                continue
            sib = coord[:ai] + (lv,) + coord[ai + 1:]
            if sib not in index:
                continue
            other = index[sib]
            flips[a][1] += 1
            if other != cls:
                flips[a][0] += 1
                detail[a]["%s -> %s" % (cls, other)] += 1
                if cls not in SILENT and other in SILENT:
                    tosilent[a][0] += 1
                if cls in SILENT and other not in SILENT:
                    tosilent[a][1] += 1

print("\n== axis mobility: ordered pairs of coordinates differing in ONE axis ==")
print("%-10s %10s %10s %8s   %8s %8s" %
      ("axis", "compared", "outcome-≠", "rate", "→silent", "→loud"))
for a in sorted(AX, key=lambda a: -(flips[a][0] / flips[a][1] if flips[a][1] else 0)):
    d, t = flips[a]
    r = ("%.3f" % (d / t)) if t else "n/a"
    print("%-10s %10d %10d %8s   %8d %8d" % (a, t, d, r, tosilent[a][0], tosilent[a][1]))

print("\n== per-axis transition detail (top 6 each) ==")
for a in AX:
    if not detail[a]:
        print("  %-10s INERT over %d one-step sibling pairs" % (a, flips[a][1]))
        continue
    top = sorted(detail[a].items(), key=lambda x: -x[1])[:6]
    print("  %-10s %s" % (a, "; ".join("%s x%d" % (k, v) for k, v in top)))
