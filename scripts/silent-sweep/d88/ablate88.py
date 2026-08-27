#!/usr/bin/env python3
"""Ablation report for the D88/D100 grid.

Reads `base.json`, `d88only.json`, `d100only.json` and `both.json` from the directory
given as argv[1]. Prints, per candidate: the class transitions with their DIRECTION, the
count of cells that moved MESSAGE within a class (a partial fix inside one outcome class
is invisible to a class count — that is how D111 was found), the per-axis breakdown of
the moved set, and the pairwise intersection plus the union-of-singles vs full-branch
set identity that decides whether the rows are one root or two.
"""
import json, sys, os
from collections import Counter, defaultdict

D = sys.argv[1] if len(sys.argv) > 1 else "."
base = json.load(open(os.path.join(D, "base.json")))
d88  = json.load(open(os.path.join(D, "d88only.json")))
d100 = json.load(open(os.path.join(D, "d100only.json")))
both = json.load(open(os.path.join(D, "both.json")))

SILENT = {"check-clean invalid wasm", "runs but wrong value"}
LOUD = {"loud check reject", "loud emit reject", "compiler trap"}

def moved(a, b):
    """cells whose CLASS changed"""
    return {k for k in a if a[k]["class"] != b[k]["class"]}

def moved_msg(a, b):
    """cells whose class is the SAME but the MESSAGE changed (loud->loud etc.)"""
    return {k for k in a if a[k]["class"] == b[k]["class"] and a[k]["msg"] != b[k]["msg"]}

names = {"D88-only": d88, "D100-only": d100, "BOTH": both}
sets = {}
for n, g in names.items():
    m = moved(base, g)
    sets[n] = m
    print("=" * 74)
    print(n, "— %d cells moved class, %d moved MESSAGE within class" % (len(m), len(moved_msg(base, g))))
    tr = Counter((base[k]["class"], g[k]["class"]) for k in m)
    for (f, t), c in sorted(tr.items(), key=lambda x: -x[1]):
        direction = "FORWARD" if t == "runs" else ("BACKWARD" if f == "runs" else "sideways")
        silent_risk = "  <-- BLOCKER: to a SILENT class" if (t in SILENT and f not in SILENT) else ""
        print("   %-26s -> %-26s %5d  %s%s" % (f, t, c, direction, silent_risk))
    # any cell that lost `runs`?
    lost = [k for k in m if base[k]["class"] == "runs"]
    print("   runs LOST: %d" % len(lost))
    if lost: print("     ", lost[:10])

print("=" * 74)
print("PAIRWISE")
a, b = sets["D88-only"], sets["D100-only"]
print("  |D88| = %d   |D100| = %d   intersection = %d" % (len(a), len(b), len(a & b)))
if a & b: print("   shared:", sorted(a & b)[:10])
u = a | b
c = sets["BOTH"]
print("  union of singles = %d   BOTH = %d   set-identical: %s" % (len(u), len(c), u == c))
if u != c:
    print("   only in BOTH:", sorted(c - u)[:20])
    print("   only in union:", sorted(u - c)[:20])

# per-axis breakdown of each candidate's moved set
AX = ["decl", "src", "cont", "route", "deliv", "ann", "order"]
for n in ("D88-only", "D100-only"):
    print("-" * 74)
    print(n, "moved cells by axis:")
    cols = defaultdict(Counter)
    for k in sets[n]:
        parts = k[:-3].split("_")
        for i, ax in enumerate(AX):
            cols[ax][parts[i]] += 1
    for ax in AX:
        print("   %-6s %s" % (ax, dict(cols[ax])))

# message-level diffs, loud -> loud
print("=" * 74)
print("MESSAGE-LEVEL DIFFS (same class, different message) — BOTH vs base")
mm = moved_msg(base, both)
print("  count:", len(mm))
seen = Counter()
for k in sorted(mm):
    seen[(base[k]["class"], base[k]["msg"][:90], both[k]["msg"][:90])] += 1
for (cl, f, t), c in seen.most_common(12):
    print("   [%s] x%d" % (cl, c))
    print("     was: ", f)
    print("     now: ", t)
