#!/usr/bin/env python3
"""Per-cell transition matrix master -> branch, plus a pivot of the moved cells."""
import collections
import sys

SILENT = {"wrong_value", "invalid_wasm", "trap", "compiler_trap"}
LOUD = {"loud_check_reject", "loud_emit_reject", "hint_only_rc1", "other_fail"}
AXES = ["decl", "ann", "twin", "cont", "cons", "route", "order"]


def load(p):
    d = {}
    msg = {}
    for line in open(p):
        parts = line.rstrip("\n").split("\t")
        d[parts[0]] = parts[1]
        msg[parts[0]] = parts[2] if len(parts) > 2 else ""
    return d, msg


def klass(o):
    if o in SILENT:
        return "SILENT"
    if o == "runs":
        return "runs"
    return "LOUD"


a, amsg = load(sys.argv[1])
b, bmsg = load(sys.argv[2])
assert set(a) == set(b), "cell sets differ"

trans = collections.Counter()
moved = []
for k in sorted(a):
    if a[k] != b[k]:
        trans[(a[k], b[k])] += 1
        moved.append(k)

print("=== outcome totals ===")
for name, d in (("master", a), ("branch", b)):
    t = collections.Counter(d.values())
    s = sum(v for kk, v in t.items() if kk in SILENT)
    print("%-7s total=%d  silent=%d  %s" % (name, len(d), s, dict(t)))

print("\n=== transitions (master -> branch) ===")
back = 0
for (x, y), n in sorted(trans.items(), key=lambda kv: -kv[1]):
    direction = ""
    order = {"LOUD": 0, "SILENT": 0, "runs": 2}
    kx, ky = klass(x), klass(y)
    if ky == "runs" and kx != "runs":
        direction = "FORWARD"
    elif kx == "SILENT" and ky == "LOUD":
        direction = "forward (silent -> loud)"
    elif kx == "runs":
        direction = "*** BACKWARD ***"
        back += n
    elif kx == "LOUD" and ky == "SILENT":
        direction = "*** BACKWARD (loud -> silent) ***"
        back += n
    else:
        direction = "lateral"
    print("  %-20s -> %-20s %5d   %s" % (x, y, n, direction))
print("\nmoved=%d  backward=%d" % (len(moved), back))

print("\n=== moved cells, per axis ===")
for i, ax in enumerate(AXES):
    c = collections.Counter(k.split("_")[i] for k in moved)
    print("  %-6s %s" % (ax, dict(c)))

print("\n=== moved cells by (master outcome, axis coords) sample ===")
bykind = collections.defaultdict(list)
for k in moved:
    bykind[(a[k], b[k])].append(k)
for kk in sorted(bykind):
    print("  %s -> %s  (%d)" % (kk[0], kk[1], len(bykind[kk])))
    for s in bykind[kk][:6]:
        print("      %s" % s)

print("\n=== SILENT residue on the BRANCH, per axis ===")
res = [k for k in b if b[k] in SILENT]
for i, ax in enumerate(AXES):
    c = collections.Counter(k.split("_")[i] for k in res)
    print("  %-6s %s" % (ax, dict(c)))
print("  messages:")
for m, n in collections.Counter(bmsg[k] for k in res).most_common(8):
    print("    %4d  %s" % (n, m[:130]))
print("  sample cells:")
for s in sorted(res)[:10]:
    print("      %s" % s)

print("\n=== SILENT on MASTER, per axis (for comparison) ===")
resm = [k for k in a if a[k] in SILENT]
for i, ax in enumerate(AXES):
    c = collections.Counter(k.split("_")[i] for k in resm)
    print("  %-6s %s" % (ax, dict(c)))
