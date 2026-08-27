#!/usr/bin/env python3
"""Cross-tab the silent residue so each surviving shape is named rather than rounded off."""
import collections
import sys

SILENT = {"wrong_value", "invalid_wasm", "trap", "compiler_trap"}
AXES = ["decl", "ann", "twin", "cont", "cons", "route", "order"]


def load(p):
    d, msg = {}, {}
    for line in open(p):
        parts = line.rstrip("\n").split("\t")
        d[parts[0]] = parts[1]
        msg[parts[0]] = parts[2] if len(parts) > 2 else ""
    return d, msg


b, bmsg = load(sys.argv[1])
res = sorted(k for k in b if b[k] in SILENT)
print("silent residue: %d" % len(res))

group = sys.argv[2].split(",") if len(sys.argv) > 2 else ["cons", "cont", "route"]
idx = [AXES.index(g) for g in group]
c = collections.Counter(tuple(k.split("_")[i] for i in idx) for k in res)
print("\ngrouped by %s:" % ",".join(group))
for kk, n in sorted(c.items(), key=lambda kv: -kv[1]):
    print("  %-40s %4d" % (" / ".join(kk), n))
    ex = [k for k in res if tuple(k.split("_")[i] for i in idx) == kk]
    sub = collections.Counter(k.split("_")[1] for k in ex)
    print("        ann: %s" % dict(sub))
    print("        e.g. %s" % ex[0])
