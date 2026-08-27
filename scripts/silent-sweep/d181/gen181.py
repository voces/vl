#!/usr/bin/env python3
"""The D181 grid — the CONTAINER ALIAS axis crossed with `annpat`.

WHY IT EXISTS.  D181's family is the census's largest single rescue set — 2,254 silent
coordinates whose ONLY one-step rescue is `claim=0` — and across every one of them the
census holds `annpat` CONSTANT at `outer`.  `annpat` is the axis that says WHICH
INTERMEDIATE LEVEL of a nested container carries an annotation, and it is the third most
mobile axis in the whole census (0.265 outcome-change rate over 36,000 one-step sibling
pairs).  The census cannot cross it with `claim` at all: block D is the only block that
varies `annpat`, and block D pins `claim=0` by construction ("nothing nominal declared").
So the one grid that varies the alias axis holds the annotation-pattern axis fixed, and the
one grid that varies the annotation-pattern axis holds the alias axis fixed.  This crosses
them.

THE AXES

  claim    0 | 1 | 2   container aliases of the SAME layout, each with one value of it
  annpat   outer | none | inner | mid | all   which level carries an annotation
  rep      the 16 payload field types
  annpos   none | binding | dest | retann | readsite
  cont     list_of_map  — D181's own container, held fixed ON PURPOSE (this grid exists to
           cross the two axes above, not to re-measure the container axis the census
           already crosses fully)

Everything else is the census's CLEAN coordinate: store=local, escope=fn, declness=byname
(nodecl for the two scalar reps, which have no object shape to declare), twin=none,
union=nounion, deliv=direct, pval=single, order=norm.

The programs come from `gencensus.py`'s own emitter, so a cell here and a cell of the census
at the same coordinate are the SAME PROGRAM — a hand-written paraphrase would be a different
one, and the census's own author had three witnesses move under exactly that.

EXPECTATION: computed by the generator, never by the compiler.  Every cell prints `7`.

Usage:
    python3 scripts/silent-sweep/d181/gen181.py <outdir>

Grade with `gradecensus.py` (the census grader — this grid's manifest is the census's own
shape), one seed per leg:

    JOBS=4 python3 scripts/silent-sweep/census/gradecensus.py <outdir> <seed.wasm> <out.json>
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "census"))
import gencensus as G  # noqa: E402

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

BASE = dict(store="local", escope="fn", twin="none", union="nounion",
            cont="list_of_map", deliv="direct", pval="single", order="norm")

cells, expect, coords, skips = 0, {}, {}, {}
i = 0
for claim in G.AXES["claim"]:
    for annpat in G.AXES["annpat"]:
        for rep in G.AXES["rep"]:
            for annpos in G.AXES["annpos"]:
                c = dict(BASE)
                c.update(claim=claim, annpat=annpat, rep=rep, annpos=annpos,
                         declness=("nodecl" if rep in G.SCALAR_REPS else "byname"))
                r = G.skip_reason(c)
                if r:
                    skips[r] = skips.get(r, 0) + 1
                    continue
                text, exp = G.emit(c)
                name = "a%05d" % i
                i += 1
                open(os.path.join(OUT, name + ".vl"), "w").write(text)
                expect[name] = exp
                coords[name] = c
                cells += 1

json.dump({"expect": expect, "coords": coords},
          open(os.path.join(OUT, "manifest.json"), "w"), indent=0, sort_keys=True)
print("d181 grid: %d cells" % cells)
for k, v in sorted(skips.items()):
    print("  skip %6d  %s" % (v, k))
