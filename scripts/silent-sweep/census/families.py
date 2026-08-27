#!/usr/bin/env python3
"""Cluster the census's SILENT cells into families and name each family's coordinates.

Two passes:
  1. by engine MESSAGE (renormalised so a per-store function name is not a family), and
  2. by CONTAINER x the presence/absence of the nominal ingredients, which is the shape
     the four open rows are filed on.

For each family: size, the axes that are CONSTANT across it (its signature), the axes that
vary freely inside it (so a reader does not read a coincidence as a condition), and the
smallest cell in it by source bytes, as the witness to run.

Usage: families.py <celldir> <graded.json> [<celldir> <graded.json> ...]
"""
import json
import os
import re
import sys
from collections import defaultdict

AX = ["store", "escope", "declness", "twin", "union", "claim", "cont", "annpos",
      "deliv", "pval", "order", "rep", "annpat"]
SILENT = ("runs but wrong value", "check-clean invalid wasm", "compiler trap", "trap_loads")


def renorm(m):
    m = re.sub(r"wasm\[0\]::function\[N\](::\w+)?", "wasm[0]::function[N]", m)
    m = re.sub(r"\(at offset \w+\)", "(at offset N)", m)
    m = re.sub(r"at offset N\w*", "at offset N", m)
    return " ".join(m.split())


cells = {}
for i in range(1, len(sys.argv), 2):
    d = sys.argv[i]
    man = json.load(open(d + "/manifest.json"))
    res = json.load(open(sys.argv[i + 1]))
    for k, co in man["coords"].items():
        co.setdefault("annpat", "outer")
        if k not in res:
            continue
        cells[(d, k)] = (co, res[k]["class"], renorm(res[k]["msg"]))

sil = {k: v for k, v in cells.items() if v[1] in SILENT}
print("graded %d cells, %d silent (%.2f%%)" %
      (len(cells), len(sil), 100.0 * len(sil) / max(1, len(cells))))
byclass = defaultdict(int)
for _, (co, cls, _m) in cells.items():
    byclass[cls] += 1
for c in sorted(byclass, key=lambda c: -byclass[c]):
    print("   %-26s %7d" % (c, byclass[c]))


def signature(ks):
    const, varies = {}, []
    for a in AX:
        vals = sorted({cells[k][0][a] for k in ks})
        if len(vals) == 1:
            const[a] = vals[0]
        else:
            varies.append("%s(%d)" % (a, len(vals)))
    return const, varies


def smallest(ks):
    best, bl = None, 10 ** 9
    for d, k in ks:
        p = os.path.join(d, k + ".vl")
        n = os.path.getsize(p)
        if n < bl:
            best, bl = (d, k), n
    return best, bl


print("\n" + "=" * 78)
print("PASS 1 — silent cells clustered by ENGINE MESSAGE")
print("=" * 78)
bymsg = defaultdict(list)
for k, (co, cls, m) in sil.items():
    bymsg[(cls, m)].append(k)
for (cls, m), ks in sorted(bymsg.items(), key=lambda x: -len(x[1])):
    const, varies = signature(ks)
    w, wl = smallest(ks)
    print("\n%6d  %s" % (len(ks), cls))
    print("        msg: %s" % m[:150])
    print("        constant: %s" % (", ".join("%s=%s" % kv for kv in sorted(const.items()))
                                    or "(nothing)"))
    print("        varies  : %s" % (", ".join(varies) or "(nothing)"))
    print("        witness : %s/%s.vl  (%d bytes)" % (w[0], w[1], wl))

print("\n" + "=" * 78)
print("PASS 2 — silent cells by CONTAINER x nominal ingredients")
print("=" * 78)


def ingredients(co):
    return (co["cont"],
            "twin" if co["twin"] != "none" else "-",
            "union" if co["union"] != "nounion" else "-",
            "claim" if co["claim"] != "0" else "-",
            "decl" if co["declness"] != "nodecl" else "-")


bying = defaultdict(list)
for k, (co, cls, m) in sil.items():
    bying[ingredients(co)].append(k)
tot = defaultdict(int)
for k, (co, cls, m) in cells.items():
    tot[ingredients(co)] += 1
print("%-14s %-5s %-6s %-6s %-5s %8s %8s %6s" %
      ("cont", "twin", "union", "claim", "decl", "silent", "total", "rate"))
for sig, ks in sorted(bying.items(), key=lambda x: -len(x[1])):
    t = tot[sig]
    print("%-14s %-5s %-6s %-6s %-5s %8d %8d %5.1f%%" %
          (sig[0], sig[1], sig[2], sig[3], sig[4], len(ks), t, 100.0 * len(ks) / t))

print("\n== container x nominal-ingredient combinations with ZERO silent cells ==")
zero = [s for s in tot if s not in bying]
print("   %d of %d combinations, %d cells" %
      (len(zero), len(tot), sum(tot[s] for s in zero)))
