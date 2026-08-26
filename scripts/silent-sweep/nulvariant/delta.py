#!/usr/bin/env python3
import csv, sys
from collections import Counter

base, br, label = sys.argv[1], sys.argv[2], sys.argv[3]
B = {r["cell"]: r for r in csv.DictReader(open(base))}
R = {r["cell"]: r for r in csv.DictReader(open(br))}

# silent < loud < runs, in "goodness".  A move toward the left is a BLOCKER.
RANK = {
    "check-clean invalid wasm": 0,
    "runs but wrong value": 0,
    "compiler trap": 0,
    "other error": 1,
    "runtime trap": 1,
    "loud check reject": 2,
    "loud emit reject": 2,
    "runs": 3,
}

moved, worse = [], []
for c in B:
    if c not in R:
        print("MISSING on branch:", c); continue
    a, b = B[c]["grade"], R[c]["grade"]
    if a != b:
        moved.append((c, a, b))
        if RANK[b] < RANK[a]:
            worse.append((c, a, b))
for c in R:
    if c not in B: print("NEW on branch:", c)

print("== %s: %d cells, %d moved ==" % (label, len(B), len(moved)))
for c, a, b in sorted(moved):
    print("  %-58s %-26s -> %s" % (c, a, b))
print()
print("baseline:", dict(sorted(Counter(r["grade"] for r in B.values()).items())))
print("branch:  ", dict(sorted(Counter(r["grade"] for r in R.values()).items())))
print()
d = Counter("%s -> %s" % (a, b) for _, a, b in moved)
for k, v in sorted(d.items()):
    print("  %3d  %s" % (v, k))
print()
if worse:
    print("!! %d CELL(S) MOVED TOWARD SILENCE — BLOCKER" % len(worse))
    for c, a, b in worse: print("   ", c, a, "->", b)
else:
    print("0 cells moved toward silence.")
