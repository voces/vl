#!/usr/bin/env python3
"""pivot.py <csv> <rowaxis[,rowaxis2]> <colaxis> [filter=k=v,...]  — outcome pivot."""
import csv, sys, collections

ABBR = {"correct": ".", "wrong_value": "V", "wrong_evalcount": "E", "invalid_wasm": "W",
        "trap": "T", "loud_check_reject": "c", "loud_emit_reject": "e",
        "hint_only_rc1": "h", "other_runtime_fail": "?", "missing_result": "!"}

rows = list(csv.DictReader(open(sys.argv[1])))
rowax = sys.argv[2].split(",")
colax = sys.argv[3]
filt = {}
if len(sys.argv) > 4:
    for kv in sys.argv[4].split(","):
        k, v = kv.split("=")
        filt.setdefault(k, set()).add(v)
rows = [r for r in rows if all(r[k] in vs for k, vs in filt.items())]

cells = collections.defaultdict(collections.Counter)
cols = []
for r in rows:
    rk = tuple(r[a] for a in rowax)
    ck = r[colax]
    if ck not in cols:
        cols.append(ck)
    cells[rk][ck] += 0
    cells[rk][ck + "|" + r["outcome"]] += 1

w = max((len(" ".join(k)) for k in cells), default=8) + 1
cw = max((len(c) for c in cols), default=4) + 1
print(" " * w + "".join(c.ljust(cw) for c in cols))
for rk in sorted(cells):
    line = " ".join(rk).ljust(w)
    for c in cols:
        got = [(ABBR.get(o.split("|")[1], "x"), n) for o, n in cells[rk].items()
               if o.startswith(c + "|") and n]
        got.sort()
        line += ("".join(f"{a}{n}" for a, n in got) or "-").ljust(cw)
    print(line)
print("\nlegend: . correct  V wrong-value  E wrong-evalcount  W invalid-wasm  T trap"
      "  c loud-check-reject  e loud-emit-reject  h hint-rc1")
