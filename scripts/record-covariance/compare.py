#!/usr/bin/env python3
"""compare.py A_DIR B_DIR : transitions between two grid runs' grades.json, and every cell that
runs under both with different output."""
import json, sys
from collections import Counter
a = {r["cell"]: r for r in json.load(open(sys.argv[1] + "/grades.json"))}
b = {r["cell"]: r for r in json.load(open(sys.argv[2] + "/grades.json"))}
tr = Counter()
for k in sorted(a):
    if k not in b:
        continue
    ga, gb = a[k]["grade"], b[k]["grade"]
    tr[(ga, gb, "F" if a[k]["fresh"] else "N")] += 1
    moved = ga == gb == "RUNS" and a[k]["msg"] != b[k]["msg"]
    if moved:
        print(f"VALUE   {k}  {a[k]['msg']} -> {b[k]['msg']}")
    if ga != gb or gb in ("SILENT", "WRONG", "TRAP", "EMIT"):
        print(f"{ga:7} -> {gb:7} {'F' if a[k]['fresh'] else 'N'} {k}  | {b[k]['msg'][:150]}")
print()
for (x, y, f), n in sorted(tr.items()):
    print(f"{x:7} -> {y:7} {f}: {n}")
