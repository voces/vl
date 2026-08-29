#!/usr/bin/env python3
"""Rebuild the DERIVED half of the distilled corpus from every graded census snapshot on disk.

`cells/` is one representative per BEHAVIOURAL EQUIVALENCE CLASS: two census cells belong to
the same class when every graded snapshot in the history gave them the identical
`(outcome, message)`. Collapsing 250,238 cells that way leaves 1,477 — see README.md for the
redundancy table and the coverage validation that licenses the collapse.

**`named/` is NOT touched by this script and must not be.** It holds the exact cells that some
real regression NAMED, and a collapse cannot derive them: D272's 72-cell runs-lost set is all
`runs` on today's compiler, indistinguishable from thousands of neighbours, so a behavioural
collapse of its grid (34 reps) and an axis floor over its four axes (285 reps) each covered
ZERO of the 72. What makes a named cell worth keeping is what a candidate DID to it, which no
rule reading current behaviour can see.

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

from cellmap import dump_cells

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
        cells = sorted(man["coords"])  # the census manifest's cell list
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
            # NO `class`/`msg` HERE. They were written from the last graded snapshot and
            # nothing refreshed them when a landing moved the baseline, so they rotted
            # structurally: measured 2026-08-29, 1,593 of 3,671 cells (43%) disagreed with
            # `baseline.jsonl`, and an agent nearly graded a row off the stale copy. Unlike
            # the `coords` blob removed in #1988, these read as authoritative. Current
            # behaviour lives in `baseline.jsonl`, which `--write-baseline` keeps honest;
            # this file carries only what `regress.py` reads — `represents` and `block`.
            index[c] = {"block": b.upper(), "represents": len(groups[sig[c]])}

    n = sum(t[1] for t in totals)
    d = sum(t[3] for t in totals)
    print(f"\nTOTAL: {n} cells -> {d} representatives "
          f"({100 * (1 - d / n):.2f}% redundant, {n / d:.0f}x)")
    if DRY:
        print("--dry-run: nothing written")
        return 0

    # Only `cells/` is derived. `named/` is curated and is never rebuilt or removed here.
    out = os.path.join(HERE, "cells")
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    for srcf, c in staged:
        shutil.copyfile(srcf, os.path.join(out, c + ".vl"))
    json.dump({"expect": expect,
               "block": "distilled",
               "generated": len(index),
               "meta": {"note": "one representative per behavioural equivalence class "
                                "of the census; rebuilt by redistil.py"}},
              open(os.path.join(out, "manifest.json"), "w"), indent=1, sort_keys=True)
    dump_cells(os.path.join(HERE, "expected.jsonl"), index)
    print(f"wrote {out}/*.vl ({len(staged)} cells), cells/manifest.json and expected.jsonl")
    ncur = len(glob.glob(os.path.join(HERE, "named", "*.vl")))
    if ncur:
        print(f"named/ left untouched: {ncur} curated cells")
    print("now re-baseline:  python3 regress.py <seed.wasm> --write-baseline")
    return 0


if __name__ == "__main__":
    sys.exit(main())
