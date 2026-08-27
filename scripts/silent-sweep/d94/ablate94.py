#!/usr/bin/env python3
"""
Ablation reader for the D93 / D94 grid.

  ablate94.py <tsvdir> <base> <full> <name>...

Takes one TSV per candidate compiler (produced by `d52/sweep52.py`, reused verbatim so
this grid's residue is comparable with D52's and D87's) and reports:

  * the per-candidate MOVED set against `<base>`, split by direction;
  * every PAIRWISE intersection of the moved sets;
  * whether the union of the singles is set-IDENTICAL to `<full>`'s moved set, and
    whether `<full>` agrees with each single on every cell that single moves;
  * cells whose OUTCOME is unchanged and whose MESSAGE is not — D57's stage B moved 36
    cells between two `check-clean invalid wasm` mechanisms and an outcome-class grader
    scored them unchanged, so this comparison is not optional.

Win direction is `runs`. Any move to a SILENT class is reported on its own line.
"""
import itertools
import os
import sys

SILENT = {"wrong_value", "invalid_wasm", "trap", "compiler_trap"}


def load(path):
    d = {}
    for line in open(path):
        parts = line.rstrip("\n").split("\t")
        if not parts or not parts[0]:
            continue
        d[parts[0]] = (parts[1], parts[2] if len(parts) > 2 else "")
    return d


def main():
    tsvdir, base, full = sys.argv[1], sys.argv[2], sys.argv[3]
    names = sys.argv[4:]
    B = load(os.path.join(tsvdir, base + ".tsv"))
    F = load(os.path.join(tsvdir, full + ".tsv"))
    tabs = {n: load(os.path.join(tsvdir, n + ".tsv")) for n in names}

    def tally(d):
        t = {}
        for _, (o, _m) in d.items():
            t[o] = t.get(o, 0) + 1
        return t

    print("cells=%d" % len(B))
    print()
    print("%-8s %-6s %-10s %-14s %-8s %s" %
          ("compiler", "runs", "loud_emit", "invalid_wasm", "moved", "other"))
    for n, d in [(base, B)] + [(k, tabs[k]) for k in names] + [(full, F)]:
        t = tally(d)
        moved = sum(1 for k in B if B[k][0] != d[k][0])
        other = {k: v for k, v in t.items()
                 if k not in ("runs", "loud_emit_reject", "invalid_wasm")}
        print("%-8s %-6d %-10d %-14d %-8s %s" %
              (n, t.get("runs", 0), t.get("loud_emit_reject", 0),
               t.get("invalid_wasm", 0),
               "-" if n == base else str(moved), other or ""))

    moved = {}
    print()
    for n in names + [full]:
        d = F if n == full else tabs[n]
        fwd, back, msg = [], [], []
        for k in sorted(B):
            if B[k][0] != d[k][0]:
                if d[k][0] == "runs":
                    fwd.append(k)
                elif d[k][0] in SILENT and B[k][0] not in SILENT:
                    back.append((k, B[k][0], d[k][0]))
                else:
                    back.append((k, B[k][0], d[k][0]))
            elif B[k][1] != d[k][1]:
                msg.append(k)
        moved[n] = set(fwd) | {b[0] for b in back}
        print("%s: moved=%d  -> runs=%d  other-direction=%d  message-only=%d"
              % (n, len(moved[n]), len(fwd), len(back), len(msg)))
        for k, a, b in back:
            tag = "  *** TO SILENT ***" if b in SILENT and a not in SILENT else ""
            print("    OTHER  %-44s %s -> %s%s" % (k, a, b, tag))
        for k in msg:
            print("    MSGDIFF %-44s" % k)
            print("        base: %s" % B[k][1])
            print("        %-5s %s" % (n, d[k][1]))

    print()
    print("pairwise intersections of the moved sets:")
    for a, b in itertools.combinations(names, 2):
        inter = moved[a] & moved[b]
        print("  %-6s x %-6s  %d %s" % (a, b, len(inter), sorted(inter) or ""))

    union = set()
    for n in names:
        union |= moved[n]
    print()
    print("union of singles = %d, %s moved = %d, set-identical=%s"
          % (len(union), full, len(moved[full]), union == moved[full]))
    if union != moved[full]:
        print("  only in union: %s" % sorted(union - moved[full]))
        print("  only in %s:    %s" % (full, sorted(moved[full] - union)))
    dis = []
    for n in names:
        for k in moved[n]:
            d = tabs[n]
            if F[k][0] != d[k][0]:
                dis.append((n, k, d[k][0], F[k][0]))
    print("full disagrees with a single on a cell that single moves: %d" % len(dis))
    for n, k, a, b in dis:
        print("  %-6s %-44s single=%s full=%s" % (n, k, a, b))


if __name__ == "__main__":
    main()
