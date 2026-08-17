#!/usr/bin/env python3
"""Per-axis totals with denominators, and the message histogram for each loud column."""
import csv, collections, sys

rows = []
for path in sys.argv[1:]:
    for r in csv.DictReader(open(path)):
        r["_src"] = path
        rows.append(r)

N = len(rows)
COLS = ["correct", "wrong_value", "wrong_evalcount", "invalid_wasm", "trap",
        "compiler_trap", "loud_check_reject", "loud_emit_reject", "hint_only_rc1",
        "other_runtime_fail", "missing_result"]
c = collections.Counter(r["outcome"] for r in rows)
print(f"TOTAL CELLS {N}")
for k in COLS:
    if c[k]:
        print(f"  {k:20s} {c[k]:6d} / {N}")
sil = sum(c[k] for k in ("wrong_value", "wrong_evalcount", "invalid_wasm", "trap",
                         "compiler_trap"))
print(f"  {'SILENT TOTAL':20s} {sil:6d} / {N}")


def axis(name, key):
    print(f"\n== by {name} ==")
    tot = collections.Counter(r[key] for r in rows)
    for v in sorted(tot):
        sub = [r for r in rows if r[key] == v]
        cc = collections.Counter(r["outcome"] for r in sub)
        s = sum(cc[k] for k in ("wrong_value", "wrong_evalcount", "invalid_wasm",
                                "trap", "compiler_trap"))
        print(f"  {v:14s} {len(sub):5d} cells   correct {cc['correct']:5d}   "
              f"silent {s:4d}   loudchk {cc['loud_check_reject']:5d}   "
              f"loudemit {cc['loud_emit_reject']:5d}")


for nm, k in (("leg", "leg"), ("representation", "rep"), ("position", "pos"),
              ("construct", "con"), ("runtime input", "inp"), ("nullability", "nul")):
    axis(nm, k)

print("\n== silent-cell message histogram ==")
h = collections.Counter()
for r in rows:
    if r["outcome"] in ("wrong_value", "wrong_evalcount", "invalid_wasm", "trap",
                        "compiler_trap"):
        h[(r["outcome"], r["msg"][:70])] += 1
for (o, m), n in h.most_common(30):
    print(f"  {n:5d}  {o:16s} {m}")

print("\n== loud_emit_reject message histogram (top 20) ==")
h = collections.Counter(r["msg"][:100] for r in rows if r["outcome"] == "loud_emit_reject")
for m, n in h.most_common(20):
    print(f"  {n:5d}  {m}")

print("\n== loud_check_reject message histogram (top 20) ==")
h = collections.Counter(r["msg"][9:105] for r in rows if r["outcome"] == "loud_check_reject")
for m, n in h.most_common(20):
    print(f"  {n:5d}  {m}")
