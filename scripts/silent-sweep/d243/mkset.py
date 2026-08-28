#!/usr/bin/env python3
"""Materialise a NAMED CELL SET into its own directory, so it re-grades against a new seed
in seconds instead of re-running the whole block.

`CLAUDE.md`'s cheap census substitute, applied to a per-row grid: once a full run has NAMED
a set, that set copies into its own cell directory with its own manifest and
`gradecensus.py` grades it like any other block. `scripts/silent-sweep/census/d243-moved.json`
is the set this PR left behind — the 79 cells D243/D244/D200's landing moved, every one of
them `-> runs`, so a later seed that does not run one of them has LOST it.

    python3 scripts/silent-sweep/d243/genbox.py /tmp/gridP --block P
    python3 scripts/silent-sweep/d243/genbox.py /tmp/gridQ --block Q
    python3 scripts/silent-sweep/d243/mkset.py /tmp/moved \\
        scripts/silent-sweep/census/d243-moved.json /tmp/gridP /tmp/gridQ
    JOBS=4 python3 scripts/silent-sweep/census/gradecensus.py /tmp/moved <seed.wasm> /tmp/m.json

The printed histogram must be `runs 79` and nothing else.  It is ~158 `vl` invocations.

WHY THE NAMES AND NOT THE PROGRAMS. The cells are GENERATED, so committing 79 `.vl` files
would put a second copy of the generator's output under version control and let the two
drift; the set is a list of coordinates the generator can reproduce exactly. `mkset.py`
re-checks each named cell's coordinate against the grid's own manifest and refuses if the
generator has changed under it, which is the failure that copy would hide.
"""
import json
import os
import shutil
import sys

OUT = sys.argv[1]
SET = json.load(open(sys.argv[2]))
GRIDS = sys.argv[3:]

os.makedirs(OUT, exist_ok=True)
expect, coords = {}, {}
found = set()
for g in GRIDS:
    man = json.load(open(os.path.join(g, "manifest.json")))
    for name, rec in SET["cells"].items():
        if name not in man["coords"]:
            continue
        if man["coords"][name] != rec["coord"]:
            raise SystemExit(
                "%s: the generator no longer produces this coordinate — set says %r, grid says "
                "%r. The named set is stale; re-derive it rather than grading it."
                % (name, rec["coord"], man["coords"][name]))
        shutil.copyfile(os.path.join(g, name + ".vl"), os.path.join(OUT, name + ".vl"))
        expect[name] = man["expect"][name]
        coords[name] = man["coords"][name]
        found.add(name)

missing = sorted(set(SET["cells"]) - found)
if missing:
    raise SystemExit("not found in the grids given: %s" % ", ".join(missing))

json.dump({"expect": expect, "coords": coords, "skips": {}, "block": "d243-moved",
           "generated": len(expect)}, open(os.path.join(OUT, "manifest.json"), "w"))
print("materialised %d named cells into %s" % (len(expect), OUT))
