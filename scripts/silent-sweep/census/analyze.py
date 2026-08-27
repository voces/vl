#!/usr/bin/env python3
"""Read a graded block and print, per axis, the outcome distribution; then cluster the
silent cells by message and by axis signature.

Usage: analyze.py <celldir> <graded.json> [--axis NAME] [--silent-only]
"""
import json
import sys
from collections import Counter, defaultdict

CELLS = sys.argv[1]
GRADED = sys.argv[2]
man = json.load(open(CELLS + "/manifest.json"))
res = json.load(open(GRADED))
co = man["coords"]
AX = ["store", "escope", "declness", "twin", "union", "claim", "cont", "annpos",
      "deliv", "pval", "order", "rep", "annpat"]
SILENT = ("runs but wrong value", "check-clean invalid wasm", "compiler trap", "trap_loads")

tot = Counter(res[k]["class"] for k in res)
print("== overall ==")
for k in sorted(tot):
    print("  %-26s %6d" % (k, tot[k]))
print("  %-26s %6d / %d" % ("SILENT", sum(tot[c] for c in SILENT if c in tot), len(res)))

print("\n== per axis: silent / total (share) ==")
for a in AX:
    per = defaultdict(lambda: [0, 0])
    for k, v in res.items():
        lv = co[k][a]
        per[lv][1] += 1
        if v["class"] in SILENT:
            per[lv][0] += 1
    row = "  %-9s " % a
    parts = []
    for lv in sorted(per, key=lambda x: -per[x][0]):
        s, t = per[lv]
        parts.append("%s=%d/%d" % (lv, s, t))
    print(row + "  ".join(parts))

print("\n== silent cells clustered by MESSAGE ==")
bymsg = defaultdict(list)
for k, v in res.items():
    if v["class"] in SILENT:
        bymsg[(v["class"], v["msg"])].append(k)
for (cls, msg), ks in sorted(bymsg.items(), key=lambda x: -len(x[1])):
    print("  %6d  %-24s %s" % (len(ks), cls, msg[:110]))
    sig = {}
    for a in AX:
        vals = sorted({co[k][a] for k in ks})
        if len(vals) == 1:
            sig[a] = vals[0]
    print("          constant: " + ", ".join("%s=%s" % kv for kv in sorted(sig.items())))
    print("          example : " + ks[0])

print("\n== loud clustered by MESSAGE (top 15) ==")
bymsg = defaultdict(list)
for k, v in res.items():
    if v["class"] in ("loud check reject", "loud emit reject"):
        bymsg[(v["class"], v["msg"])].append(k)
for (cls, msg), ks in sorted(bymsg.items(), key=lambda x: -len(x[1]))[:15]:
    sig = {}
    for a in AX:
        vals = sorted({co[k][a] for k in ks})
        if len(vals) == 1:
            sig[a] = vals[0]
    print("  %6d  %-20s %s" % (len(ks), cls, msg[:95]))
    print("          constant: " + ", ".join("%s=%s" % kv for kv in sorted(sig.items())))
