#!/usr/bin/env python3
"""
The D75 / D81 / D82 ablation.

  ablate87.py <tsvdir> <base> <full> <name>=<tsv> ...

One compiler per candidate, all graded over the ONE grid `gen87.py` writes.  Reports the
per-candidate moved set, every pairwise intersection, and whether the UNION of the singles
is set-identical to the full branch's — the three questions a "same root" claim is only a
resemblance without.

MESSAGES ARE DIFFED, NOT JUST OUTCOME CLASSES.  A partial fix INSIDE one silent class is
invisible to a grader that reads the class: D57's stage B moved 36 cells from one
`check-clean invalid wasm` mechanism to another and the class grader scored them unchanged.
So every comparison also reports cells whose OUTCOME is equal and whose MESSAGE is not.
"""
import collections
import sys

SILENT = {"wrong_value", "invalid_wasm", "trap", "compiler_trap"}
AXES = ["decl", "twin", "route", "src", "dst"]


def load(p):
    out = {}
    msg = {}
    for line in open(p):
        parts = line.rstrip("\n").split("\t")
        out[parts[0]] = parts[1]
        msg[parts[0]] = parts[2] if len(parts) > 2 else ""
    return out, msg


def klass(o):
    if o in SILENT:
        return "SILENT"
    if o == "runs":
        return "runs"
    return "LOUD"


def moved(a, b):
    return {k for k in a if a[k] != b[k]}


def msgmoved(a, amsg, b, bmsg):
    return {k for k in a if a[k] == b[k] and amsg[k] != bmsg[k]}


def direction(x, y):
    kx, ky = klass(x), klass(y)
    if ky == "runs" and kx != "runs":
        return "FORWARD"
    if kx == "SILENT" and ky == "LOUD":
        return "forward (silent -> loud)"
    if kx == "runs":
        return "*** BACKWARD ***"
    if kx == "LOUD" and ky == "SILENT":
        return "*** BACKWARD (loud -> silent) ***"
    return "lateral"


def report_pair(label, a, amsg, b, bmsg):
    mv = moved(a, b)
    mm = msgmoved(a, amsg, b, bmsg)
    trans = collections.Counter((a[k], b[k]) for k in mv)
    back = 0
    print("\n--- %s : %d cells moved, %d more changed MESSAGE only ---" % (
        label, len(mv), len(mm)))
    for (x, y), n in sorted(trans.items(), key=lambda kv: -kv[1]):
        d = direction(x, y)
        if "BACKWARD" in d:
            back += n
        print("    %-18s -> %-18s %5d  %s" % (x, y, n, d))
    if mm:
        pairs = collections.Counter((amsg[k][:60], bmsg[k][:60]) for k in mm)
        for (x, y), n in pairs.most_common(6):
            print("    MSG %5d  %s\n              -> %s" % (n, x, y))
    print("    backward=%d" % back)
    return mv, mm


def main():
    tsvdir = sys.argv[1]
    base = sys.argv[2]
    full = sys.argv[3]
    names = sys.argv[4:]
    data = {}
    for n in [base, full] + names:
        data[n] = load("%s/%s.tsv" % (tsvdir, n))
    keys = set(data[base][0])
    for n in data:
        assert set(data[n][0]) == keys, "cell sets differ: " + n

    print("=== outcome totals ===")
    for n in [base] + names + [full]:
        t = collections.Counter(data[n][0].values())
        s = sum(v for k, v in t.items() if k in SILENT)
        print("  %-4s total=%d silent=%d  %s" % (n, len(keys), s, dict(t)))

    b, bm = data[base]
    singles = {}
    for n in names:
        a, am = data[n]
        mv, _ = report_pair("%s vs %s" % (n, base), b, bm, a, am)
        singles[n] = mv

    f, fm = data[full]
    mvf, _ = report_pair("%s (full) vs %s" % (full, base), b, bm, f, fm)

    print("\n=== pairwise intersections of the single-candidate moved sets ===")
    ns = list(names)
    for i in range(len(ns)):
        for j in range(i + 1, len(ns)):
            x, y = ns[i], ns[j]
            inter = singles[x] & singles[y]
            print("  %s n %s = %d   (|%s|=%d  |%s|=%d)" % (
                x, y, len(inter), x, len(singles[x]), y, len(singles[y])))
            for c in sorted(inter)[:5]:
                print("        %s" % c)

    uni = set()
    for n in ns:
        uni |= singles[n]
    print("\n=== union of singles vs the full branch ===")
    print("  |union of singles| = %d" % len(uni))
    print("  |full moved|       = %d" % len(mvf))
    print("  set-identical      = %s" % (uni == mvf))
    only_full = sorted(mvf - uni)
    only_uni = sorted(uni - mvf)
    if only_full:
        print("  moved ONLY by the composition (%d) -- these need TWO patches:" % len(only_full))
        for c in only_full[:20]:
            print("        %s   %s -> %s" % (c, b[c], f[c]))
    if only_uni:
        print("  moved by a single but NOT by the full branch (%d):" % len(only_uni))
        for c in only_uni[:20]:
            print("        %s   %s -> %s" % (c, b[c], f[c]))

    print("\n=== silent residue on %s, per axis ===" % full)
    res = [k for k in f if f[k] in SILENT]
    for i, ax in enumerate(AXES):
        c = collections.Counter(k.split("_")[i] for k in res)
        print("  %-6s %s" % (ax, dict(c)))
    print("  messages:")
    for m, n in collections.Counter(fm[k] for k in res).most_common(8):
        print("    %4d  %s" % (n, m[:120]))
    print("  cells:")
    for s in sorted(res):
        print("      %s" % s)

    print("\n=== silent on %s, per axis (for comparison) ===" % base)
    resb = [k for k in b if b[k] in SILENT]
    for i, ax in enumerate(AXES):
        c = collections.Counter(k.split("_")[i] for k in resb)
        print("  %-6s %s" % (ax, dict(c)))


if __name__ == "__main__":
    main()
