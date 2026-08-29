#!/usr/bin/env python3
"""Materialise the NAMED sets D401's and D426's grids name, into
`scripts/silent-sweep/distilled/named/`.

Three sets, and each is kept WHOLE because a derived rule provably cannot find it —
on the shipped tree every one of these cells behaves exactly like its class-mates,
and what makes it worth keeping is what a candidate DID to it.

  d401p_*    the 19 cells of `d401/printgrid.py` that were check-clean invalid wasm
             on master and are refusals now, plus the four one-character neighbours
             that RUN and must not move with them.
  d426nul_*  the PRICE of D426's floor: 4 cells that RUN on master because
             `boolean | null` and `K | null` happen to rep as the plain i32 an
             unsubstituted `T | null` defaults to, and are refused now.
  d426lift_* the 33 cells of `d426/lamgrid.py` that were check-clean invalid wasm and
             are refusals now, EVERY ONE OF WHICH HAS A CONTROL THAT RUNS. They are
             what per-pin lambda lifting would buy back, so they are the tripwire that
             says when someone has bought it.

    python3 scripts/silent-sweep/d401/mkset.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
NAMED = os.path.join(R, "scripts/silent-sweep/distilled/named")
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(R, "scripts/silent-sweep/d426"))

import printgrid  # noqa: E402
import lamgrid  # noqa: E402

# ── the D401 set: the 19 moved cells, plus the neighbours that must not move ──────────
D401_MOVED = [
    ("bare", r)
    for r in (
        "arr_arr_s", "arr_bool", "arr_f64", "arr_i32", "arr_nest", "arr_nul_i32",
        "arr_rec", "arr_str", "fn", "map_s_i32", "nul_i32", "rec", "set_s",
        "union", "vunion",
    )
] + [("index", r) for r in ("arr_arr_s", "arr_nest", "arr_nul_i32", "arr_rec")]

D401_KEEP = [
    ("index", "arr_i32"), ("index", "arr_str"), ("index", "str"), ("bare", "i32"),
]

# ── the D426 sets, by lamgrid coordinate ─────────────────────────────────────────────
D426_PRICE = [("nul", b, y) for b in ("bool", "lit") for y in ("eq", "id")]
# The 33 cells `lamgrid.py` graded `invalid_wasm` on master `8939d435`, listed rather
# than re-derived: the set is what the grid NAMED on that seed, and a rule that reads
# today's behaviour would not reproduce it (they are all refusals now, exactly like
# hundreds of their neighbours).
D426_LIFT = [
    ("arr", "arr", "eq"), ("arr", "arr", "id"), ("arr", "bool", "eq"),
    ("arr", "bool", "id"), ("arr", "f64", "id"), ("arr", "i32", "eq"),
    ("arr", "i32", "id"), ("arr", "lit", "eq"), ("arr", "lit", "id"),
    ("arr", "rec", "id"), ("arr", "str", "eq"), ("arr", "str", "id"),
    ("arr2", "bool", "eq"), ("arr2", "bool", "id"), ("arr2", "f64", "id"),
    ("arr2", "i32", "eq"), ("arr2", "i32", "id"), ("arr2", "lit", "eq"),
    ("arr2", "lit", "id"), ("arr2", "rec", "id"), ("arr2", "str", "id"),
    ("nul", "arr", "eq"), ("nul", "arr", "id"), ("nul", "f64", "eq"),
    ("nul", "f64", "id"), ("nul", "i32", "eq"), ("nul", "i32", "id"),
    ("nul", "nuli", "eq"), ("nul", "nuli", "id"), ("nul", "rec", "eq"),
    ("nul", "rec", "id"), ("nul", "str", "eq"), ("nul", "str", "id"),
]


def write(name, src):
    with open(os.path.join(NAMED, name + ".vl"), "w") as f:
        f.write(src)
    return name


def main():
    made = []
    for op, rep in D401_MOVED + D401_KEEP:
        made.append(write("d401p_%s_%s" % (op, rep), printgrid.prog(rep, op)))
    # `d426lift_*` is the SILENT set only — a cell already loud on master is its
    # class-mate and carries nothing this set exists to carry. The four PRICE cells are
    # `d426nul_*` and never appear here, so no cell is counted twice.
    for k, b, y in D426_PRICE:
        made.append(write("d426nul_%s_%s" % (b, y), lamgrid.mk(k, b, y, True)))
    for k, b, y in D426_LIFT:
        if (k, b, y) in D426_PRICE:
            continue
        made.append(write("d426lift_%s_%s_%s" % (k, b, y), lamgrid.mk(k, b, y, True)))
    print("wrote %d cells into %s" % (len(made), NAMED))


if __name__ == "__main__":
    main()
