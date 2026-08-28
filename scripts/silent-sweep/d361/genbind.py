#!/usr/bin/env python3
"""THE D361 POPULATION — census block E's `pval=mixed` slice, respelled through a BINDING.

D361 is a cell of block E written one word differently.  Every block-E read is spelled
`(gN[0]).r`, an element READ, and `armRecvHoldsBareArm`'s ref-list-element decline turns
the whole `cont=map_of_list x pval=mixed` family into a LOUD emit reject there.  Bind the
element first — `const e0 = gN[0]` and then `e0.r` — and the decline never fires, the
module is written, and the disagreement the literal minted reaches the engine instead:
`vl check` rc 0 and `expected (ref null $type), found (ref $type)`.

So the loudness those 24 cells buy is a property of ONE SPELLING of a class that is silent
at its neighbour, and the neighbour is not in the census at all.  This generator makes it:
every `pval=mixed` cell of block E, rewritten from the element-read spelling to the binding
spelling, keeping the generator's own expectation.

    python3 scripts/silent-sweep/census/gencensus.py /tmp/cellsE --block E
    python3 scripts/silent-sweep/d361/genbind.py /tmp/cellsE /tmp/d361bind
    JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py /tmp/d361bind <seed.wasm> /tmp/g.json

WHY THE WHOLE `mixed` SLICE AND NOT ONLY `map_of_list`.  The other ten containers are the
control that says the map layer is an ingredient, and `rep` in {i32, str} is the control
that says the DISAGREEMENT is: at those reps the two payload values have the same shape,
the checker records no union element, and the literal never widens.  A grid that carried
only the moving cells could not tell a fix that lands from a fix that flattens everything.

The cell NAMES are the block-E names with a `b` prefix, so a grade of this directory and a
grade of the census's own never collide in one table.
"""
import json
import os
import re
import shutil
import sys

CELLS = sys.argv[1]
OUT = sys.argv[2]

MAN = json.load(open(os.path.join(CELLS, "manifest.json")))
os.makedirs(OUT, exist_ok=True)

# `if (g1[0]).r is Cir2 {` -> `const e0 = g1[0]` + `if e0.r is Cir2 {`, preserving indent.
READ = re.compile(r"^(\s*)if \((g\d+)\[0\]\)\.(.*)$")

expect, coords, written, skipped = {}, {}, 0, 0
for name, coord in MAN["coords"].items():
    if coord["pval"] != "mixed":
        continue
    src = open(os.path.join(CELLS, name + ".vl")).read().split("\n")
    out, hit = [], 0
    for line in src:
        m = READ.match(line)
        if m:
            hit += 1
            out.append("%sconst e0 = %s[0]" % (m.group(1), m.group(2)))
            out.append("%sif e0.%s" % (m.group(1), m.group(3)))
        else:
            out.append(line)
    if hit != 1:
        skipped += 1
        continue
    open(os.path.join(OUT, "b" + name + ".vl"), "w").write("\n".join(out))
    expect["b" + name] = MAN["expect"][name]
    coords["b" + name] = coord
    written += 1

json.dump({"expect": expect, "coords": coords, "skips": {}, "block": "d361-bind",
           "generated": written}, open(os.path.join(OUT, "manifest.json"), "w"))
print("wrote %d bind-spelled cells into %s (%d block-E `mixed` cells had no "
      "`(gN[0]).` element read to respell)" % (written, OUT, skipped))
