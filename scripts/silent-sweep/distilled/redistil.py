#!/usr/bin/env python3
"""Rebuild the distilled corpus from every graded census snapshot on disk.

The corpus is one representative per BEHAVIOURAL EQUIVALENCE CLASS: two census cells belong
to the same class when every graded snapshot in the history gave them the identical
`(outcome, message)`. Collapsing 250,238 cells that way leaves 1,477 — see README.md for the
redundancy table and the coverage validation that licenses the collapse.

Run this after a full census sweep. The corpus is only as good as the history it was
collapsed from, so a new sweep is exactly when the classes should be re-derived: a compiler
that splits a class no earlier compiler split is the one risk this instrument has, and each
re-distillation retires some of it.

    python3 redistil.py [--snapshots GLOB] [--dry-run]

Representatives are the lexicographically first cell in each class, so an unchanged history
reproduces an unchanged corpus.
"""
import collections
import glob
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DEFAULT_GLOB = ROOT + "/.claude/worktrees/*/scratch-silent/census/**/*.json"
DRY = "--dry-run" in sys.argv
PAT = sys.argv[sys.argv.index("--snapshots") + 1] if "--snapshots" in sys.argv else DEFAULT_GLOB


def load_snapshots(pattern):
    """Every graded snapshot, bucketed by block via its cell-id prefix."""
    out = collections.defaultdict(list)
    for f in sorted(glob.glob(pattern, recursive=True)):
        if os.path.basename(f) == "manifest.json" or os.path.getsize(f) < 200_000:
            continue
        try:
            d = json.load(open(f))
        except Exception:
            continue
        if not isinstance(d, dict) or not d:
            continue
        k0 = next(iter(d))
        if len(k0) == 7 and k0[0] in "abcde" and k0[1:].isdigit():
            out[k0[0]].append((f, d))
    return out


def cell_source(block):
    """A generated cell directory for this block, with its manifest."""
    for c in sorted(glob.glob(ROOT + f"/.claude/worktrees/*/scratch-silent/census/cells{block.upper()}")):
        if os.path.exists(c + "/manifest.json") and len(glob.glob(c + "/*.vl")) > 100:
            return c, json.load(open(c + "/manifest.json"))
    return None, None


def main():
    snaps = load_snapshots(PAT)
    if not snaps:
        print(f"no graded snapshots matched {PAT}")
        return 1

    index, expect, totals = {}, {}, []
    staged = []
    for b in sorted(snaps):
        src, man = cell_source(b)
        if src is None:
            print(f"block {b.upper()}: no generated cell directory on disk — SKIP", file=sys.stderr)
            continue
        coords = man["coords"]
        cells = sorted(coords)
        cs = set(cells)
        files = [(f, d) for (f, d) in snaps[b] if set(d) == cs]
        if not files:
            print(f"block {b.upper()}: no snapshot covers the manifest cell set — SKIP", file=sys.stderr)
            continue

        sig = collections.defaultdict(tuple)
        for _f, d in files:
            for c in cells:
                v = d[c]
                sig[c] += ((v.get("class", ""), v.get("msg", "")),)

        groups = collections.defaultdict(list)
        for c in cells:
            groups[sig[c]].append(c)
        reps = sorted(min(v) for v in groups.values())

        totals.append((b.upper(), len(cells), len(files), len(reps)))
        print(f"block {b.upper()}: {len(cells)} cells, {len(files)} snapshots "
              f"-> {len(reps)} representatives ({100 * (1 - len(reps) / len(cells)):.2f}% redundant)")
        for c in reps:
            staged.append((os.path.join(src, c + ".vl"), c))
            expect[c] = man["expect"][c]
            index[c] = {"block": b.upper(), "class": sig[c][-1][0], "msg": sig[c][-1][1],
                        "represents": len(groups[sig[c]]), "coords": coords[c]}

    n = sum(t[1] for t in totals)
    d = sum(t[3] for t in totals)
    print(f"\nTOTAL: {n} cells -> {d} representatives "
          f"({100 * (1 - d / n):.2f}% redundant, {n / d:.0f}x)")
    if DRY:
        print("--dry-run: nothing written")
        return 0

    out = os.path.join(HERE, "cells")
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    for srcf, c in staged:
        shutil.copyfile(srcf, os.path.join(out, c + ".vl"))
    json.dump({"expect": expect,
               "coords": {c: index[c]["coords"] for c in index},
               "block": "distilled",
               "generated": len(index),
               "meta": {"note": "one representative per behavioural equivalence class "
                                "of the census; rebuilt by redistil.py"}},
              open(os.path.join(out, "manifest.json"), "w"), indent=1, sort_keys=True)
    json.dump(index, open(os.path.join(HERE, "expected.json"), "w"), indent=1, sort_keys=True)
    print(f"wrote {out}/*.vl ({len(staged)} cells), cells/manifest.json and expected.json")
    print("now re-baseline:  python3 regress.py <seed.wasm> --write-baseline")
    return 0


if __name__ == "__main__":
    sys.exit(main())
