#!/usr/bin/env python3
import csv, collections, sys
rows = list(csv.DictReader(open(sys.argv[1])))
t = collections.defaultdict(collections.Counter)
for r in rows:
    t[(r["rep"], r["read"])][(r["pos"], r["spell"], r["outcome"])] += 1
AB = {"correct": ".", "wrong_value": "V", "wrong_evalcount": "E", "invalid_wasm": "W",
      "trap": "T", "compiler_trap": "X", "loud_check_reject": "c",
      "loud_emit_reject": "e"}
cols = [("field", "fwd"), ("field", "ord"), ("elem", "ord"), ("mapval", "ord"),
        ("bare", "ord")]
print(f"{'rep/aliaskind':26s}" + "".join(f"{a+'/'+b:12s}" for a, b in cols))
for k in sorted(t):
    line = f"{k[0] + '/' + k[1]:26s}"
    for c in cols:
        got = sorted((AB.get(o[2], "?"), n) for o, n in t[k].items()
                     if o[0] == c[0] and o[1] == c[1] and n)
        line += ("".join(f"{a}{n}" for a, n in got) or "-").ljust(12)
    print(line)
print("\n== silent cells in this leg ==")
for r in rows:
    if r["outcome"] in ("wrong_value", "invalid_wasm", "trap", "compiler_trap",
                        "wrong_evalcount"):
        print(" ", r["cell"], r["rep"], r["pos"], r["spell"], r["read"],
              "inp=" + r["inp"], r["outcome"], "|", r["msg"][:80])
