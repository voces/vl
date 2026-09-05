#!/usr/bin/env python3
"""`expected.jsonl` — the corpus INDEX — and the writer that owns its CURATED half.

Every graded cell needs a row here: `regress.py` reads `block` (which says derived or
curated) and `represents` (how many census cells the cell stands for) off it. It used to
DEFAULT both, so 584 curated cells that landed with a `.vl` and a `baseline.jsonl` line and
no row were counted as block-`A` representatives standing for ZERO census cells — the split
line read 2,061/5,504 for directories holding 1,477/6,088, and a movement in any of them
would have reported `0 of 255505 census cells`. A default is a confident answer nobody
computed, which is the one thing this directory's README forbids.

`redistil.py` owns the DERIVED rows (blocks `A`-`E`) and re-derives them from the census
snapshots. This module owns the CURATED rows: one per `named/*.vl`, `represents` 1, `block`
the name of the set. A set must carry its provenance in `named/sources.json` under that
same name, because a set nobody described is the same missing answer one level out.

    python3 index.py --check                    every cell on disk has a row, and back
    python3 index.py --set <block> <cell>...    write those rows
    python3 index.py --set <block> --missing    ... for every unindexed `named/` cell
    python3 index.py --prune                    drop rows whose `.vl` is gone
"""
import glob
import json
import os
import sys

from cellmap import dump_cells, load_cells

HERE = os.path.dirname(os.path.abspath(__file__))
CELLS = os.path.join(HERE, "cells")
NAMED = os.path.join(HERE, "named")
INDEX = os.path.join(HERE, "expected.jsonl")
SOURCES = os.path.join(NAMED, "sources.json")

# The five census blocks are the DERIVED half; every other block name is a curated named
# set, and `named/sources.json` says which regression named it and what it cost.
DERIVED_BLOCKS = frozenset("ABCDE")


def cells_in(part):
    """The cell ids a grading run of `part` will produce — its `.vl` basenames."""
    return {os.path.basename(f)[:-3] for f in glob.glob(os.path.join(part, "*.vl"))}


def load_index():
    return load_cells(INDEX)


def audit(idx=None):
    """The three ways the index and the corpus can disagree, as sorted lists.

    `missing` is a cell that would be graded with no row; `orphan` is a row whose `.vl` is
    gone, which still inflates the population the report divides by; `unsourced` is a
    curated block with no `named/sources.json` entry.
    """
    idx = load_index() if idx is None else idx
    disk = cells_in(CELLS) | cells_in(NAMED)
    sources = json.load(open(SOURCES)) if os.path.exists(SOURCES) else {}
    blocks = {v["block"] for v in idx.values()} - DERIVED_BLOCKS
    return {"missing": sorted(disk - set(idx)),
            "orphan": sorted(set(idx) - disk),
            "unsourced": sorted(blocks - set(sources))}


def complaint(a):
    """The loud sentence for a failing audit, or None. Names the cells AND the fix."""
    if not (a["missing"] or a["orphan"] or a["unsourced"]):
        return None
    out = ["distilled: THE CORPUS INDEX IS INCOMPLETE — expected.jsonl does not describe "
           "the cells this run would grade, and grading anyway means defaulting an answer "
           "nobody computed."]
    if a["missing"]:
        out.append(f"  {len(a['missing'])} cell(s) on disk with NO row: "
                   + ", ".join(a["missing"][:8])
                   + (f", … and {len(a['missing']) - 8} more" if len(a["missing"]) > 8 else ""))
        out.append("    fix: python3 index.py --set <named-set> --missing   (a curated set),")
        out.append("         or python3 redistil.py                        (a derived cell),")
        out.append("         or regress.py --write-baseline --set <named-set> in one move.")
    if a["orphan"]:
        out.append(f"  {len(a['orphan'])} row(s) with NO cell: " + ", ".join(a["orphan"][:8])
                   + (f", … and {len(a['orphan']) - 8} more" if len(a["orphan"]) > 8 else ""))
        out.append("    fix: python3 index.py --prune, or restore the missing `.vl`.")
    if a["unsourced"]:
        out.append(f"  {len(a['unsourced'])} curated block(s) with no `named/sources.json` "
                   "entry: " + ", ".join(a["unsourced"]))
        out.append("    fix: add the set's provenance — what named it and what it cost.")
    return "\n".join(out)


def write_set(block, names):
    """Give each named cell a curated row. Refuses a derived cell and an unknown set."""
    sources = json.load(open(SOURCES))
    if block not in sources:
        raise SystemExit(f"index: `{block}` has no `named/sources.json` entry. A curated set "
                         "carries its provenance there — what named it and what it cost — "
                         "before it carries index rows.")
    derived = cells_in(CELLS)
    bad = sorted(n for n in names if n in derived)
    if bad:
        raise SystemExit(f"index: {', '.join(bad)} live in cells/, the DERIVED half. Their "
                         "rows come from redistil.py, never from a named set.")
    on_disk = cells_in(NAMED)
    gone = sorted(n for n in names if n not in on_disk)
    if gone:
        raise SystemExit(f"index: no `named/{gone[0]}.vl` (and {len(gone) - 1} more). A row "
                         "for a cell that is not there is the orphan half of the same defect.")
    idx = load_index()
    for n in names:
        idx[n] = {"block": block, "represents": 1}
    dump_cells(INDEX, idx)
    return len(names)


def prune():
    idx = load_index()
    disk = cells_in(CELLS) | cells_in(NAMED)
    gone = sorted(set(idx) - disk)
    for n in gone:
        del idx[n]
    if gone:
        dump_cells(INDEX, idx)
    return gone


def main(argv):
    if "--check" in argv:
        a = audit()
        msg = complaint(a)
        if msg:
            print(msg)
            return 2
        idx = load_index()
        ncur = sum(1 for v in idx.values() if v["block"] not in DERIVED_BLOCKS)
        print(f"index: {len(idx)} rows — {len(idx) - ncur} derived, {ncur} curated over "
              f"{len({v['block'] for v in idx.values()} - DERIVED_BLOCKS)} named sets ✅")
        return 0
    if "--prune" in argv:
        gone = prune()
        print(f"index: pruned {len(gone)} row(s) with no cell" + (": " + ", ".join(gone[:8])
                                                                 if gone else ""))
        return 0
    if "--set" in argv:
        block = argv[argv.index("--set") + 1]
        names = [a for a in argv[argv.index("--set") + 2:] if not a.startswith("-")]
        if "--missing" in argv:
            names += audit()["missing"]
        if not names:
            raise SystemExit("index: --set names no cells. An empty write is not a no-op, "
                             "it is a command that did nothing and said it worked.")
        print(f"index: wrote {write_set(block, sorted(set(names)))} row(s) at block {block}")
        return 0
    print(__doc__.strip())
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
