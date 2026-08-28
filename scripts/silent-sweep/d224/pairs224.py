#!/usr/bin/env python3
"""Grade grid T's `twin=armtwin` cells AGAINST THEIR OWN `twin=none` SIBLING.

The grid holds nine axes at each seed cell's own values and varies only
`twin x claim x union`, so every `armtwin` cell has an exact sibling that differs in the
three `Dot*` declaration lines and NOTHING else. That pairing is the whole measurement
D224 turns on, and a marginal histogram cannot state it:

    master: armtwin disagrees with its twin=none sibling on 334 of 621 cells
    branch: 0 of 621

plus the message check — every cell that goes loud -> check-clean invalid wasm lands on the
byte-identical validator sentence (offsets normalised) its twin-free sibling ALREADY
produces on master, which is what says the gate was an accidental loud floor rather than a
refusal being spent.

    python3 scripts/silent-sweep/d224/gen224.py /tmp/gridT /tmp/cellsA
    JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py /tmp/gridT <base.wasm>   /tmp/T-base.json
    JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py /tmp/gridT <branch.wasm> /tmp/T-branch.json
    python3 scripts/silent-sweep/d224/pairs224.py /tmp/gridT /tmp/T-base.json /tmp/T-branch.json
"""
import collections
import json
import re
import sys

GRID, BASE, BRANCH = sys.argv[1], sys.argv[2], sys.argv[3]
man = json.load(open(GRID + "/manifest.json"))
co, tag = man["coords"], man["tag"]
base, branch = json.load(open(BASE)), json.load(open(BRANCH))
OTHER = [a for a in next(iter(co.values())) if a != "twin"]
idx = {(tuple(c[a] for a in OTHER), c["twin"]): k for k, c in co.items()}


def norm(m):
    return re.sub(r"offset \d+", "offset N", (m or "")).strip()


for name, g in (("master", base), ("branch", branch)):
    for sib in ("none", "samearity"):
        ag = dis = 0
        for k, c in co.items():
            if c["twin"] != "armtwin":
                continue
            s = idx.get((tuple(c[a] for a in OTHER), sib))
            if s is None:
                continue
            if g[k]["class"] == g[s]["class"]:
                ag += 1
            else:
                dis += 1
        print("%-6s armtwin vs twin=%-9s agree %4d  disagree %4d" % (name, sib, ag, dis))

same = diff = 0
moved = collections.Counter()
for k, c in co.items():
    if c["twin"] != "armtwin":
        continue
    b, a = base[k]["class"], branch[k]["class"]
    if b == a:
        continue
    moved[(b, a)] += 1
    if a != "check-clean invalid wasm":
        continue
    s = idx.get((tuple(c[a2] for a2 in OTHER), "none"))
    if s is None:
        continue
    if base[s]["class"] == a and norm(base[s]["msg"]) == norm(branch[k]["msg"]):
        same += 1
    else:
        diff += 1
print("\narmtwin transitions:", dict(moved))
print("backward cells whose message == their twin=none sibling's ON MASTER: %d  (differ: %d)"
      % (same, diff))
