#!/usr/bin/env python3
"""Grader sabotage for the CENSUS grader.

A zero in an outcome column is only trustworthy once that column has been made to fire on
demand, so every column `gradecensus.py` can print is provoked here by construction.

PREDICTED, stated before the run:
    runs                      4
    runs but wrong value      4   (three of them are the SAME PROGRAM as a `runs` control
                                   with a different manifest -- which is what proves the
                                   grader reads the expectation and not the output)
    trap_loads                3
    check-clean invalid wasm  3
    loud emit reject          3
    loud check reject         3
    compiler trap             0   -- see NOTE

Two of these were mispredicted on the first run and the programs, not the prediction, were
corrected: `const c = [[7]]` RUNS (only the three-deep spelling through un-annotated locals
is refused) and `type W = { f: Circle }` RUNS until `Circle` is a union ARM.  Both are
recorded because a sabotage file whose stated counts it does not reproduce is worse than
none.

NOTE ON `compiler trap`.  No program is known that makes the COMPILER itself die on
`1559d80c` (the inventory's own witness for that column was proved by INJECTING a fault into
the compiler, which this census does not do), so the column cannot be provoked from source
and its zero rests on routing rather than on a witness.  Half of the discriminator IS proved
live, in one direction: the three `trap_loads` cells all reach the third `vl build` stage and
come back "module written", so a build stage stuck at "no module" would have graded them
`compiler trap` and did not.  Recorded rather than hidden.
"""
import json
import os
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
F, E = {}, {}


def add(name, text, exp):
    F[name] = text
    E[name] = exp


# ── runs (4) ──────────────────────────────────────────────────────────────────
add("ok_scalar", "print(7)\n", "7")
add("ok_map", 'type Circle = { r: i32 }\nconst c: {[string]: Circle} = Map()\n'
    'c["k"] = { r: 7 }\nprint((c["k"] ?? { r: 0 }).r)\n', "7")
add("ok_list", "const xs: i32[] = [7, 8]\nprint(xs[0])\n", "7")
add("ok_zero", "print(0)\n", "0")

# ── runs but wrong value (4): three are byte-identical to a `runs` control ─────
add("wv_scalar", "print(7)\n", "999")
add("wv_map", 'type Circle = { r: i32 }\nconst c: {[string]: Circle} = Map()\n'
    'c["k"] = { r: 7 }\nprint((c["k"] ?? { r: 0 }).r)\n', "0")
add("wv_list", "const xs: i32[] = [7, 8]\nprint(xs[0])\n", "8")
add("wv_str", 'print("seven")\n', "7")

# ── trap_loads (3): the module is VALID, loads, prints, then dies ─────────────
add("tl_idx", "const xs: i32[] = [1, 2]\nprint(7)\nprint(xs[9])\n", "7")
add("tl_idx2", 'const xs: string[] = ["a"]\nprint(7)\nprint(xs[5])\n', "7")
add("tl_idx3", "const xs: f64[] = [1.5]\nprint(7)\nprint(xs[3])\n", "7")

# ── check-clean invalid wasm (3): three LIVE census cells ────────────────────
#
# TWO SPECIMENS WERE RETIRED 2026-08-27 BECAUSE THEIR DEFECTS CLOSED, and that is the
# maintenance this file's own rule demands — a sabotage whose stated counts it does not
# reproduce is worse than none, and a column whose specimens have all been fixed is a zero
# that proves nothing.  `iw_d155` (an arm-valued map returned by an un-annotated `mkm` and
# handed to `thru`) went `check-clean invalid wasm` -> `runs` at #1965; `iw_alias` (a
# `type Box1 = {[string]: Circle}[]` alias plus one unread value of it — D181) at the
# array-of-map alias close.  Both are now `runs` and are replaced here rather than deleted
# quietly.  The replacements are the inventory's own D182 and D186, whose filed witnesses
# `scripts/check-filed-witnesses.py` still grades AS FILED.
add("iw_nulfield", '''type Circle = { r: i32 | null }
type WS1 = { f: {[string]: Circle} }
const lv1 = Map()
lv1["k0"] = { r: null }
const c: WS1 = { f: lv1 }
const g1 = (c.f)["k0"] ?? { r: null }
if g1.r != null { print(7) } else { print(0) }
''', "0")
add("iw_listlist", '''type Circle = { r: i32 }
type Dot = { r: i32 }
type Sq = { s: i32 }
type Shape = Circle | Sq
function rd() {
  const lv1 = [{ r: 7 }]
  const c: Circle[][] = [lv1]
  print(c[0][0].r)
}
rd()
''', "7")
add("iw_lomarm", '''type Cir2 = { c2: i32 }
type Sq2 = { s2: i32 }
type Shape2 = Cir2 | Sq2
const lv1 = Map()
lv1["k0"] = { r: { c2: 1 } }
const c: {[string]: {r: Shape2}}[] = [lv1]
const g0 = c
if g0.length > 0 {
  const g1 = (g0[0])["k0"] ?? { r: { s2: 1 } }
  if (g1).r is Cir2 { print(7) } else { print(0) }
} else { print(0) }
''', "7")

# ── loud emit reject (3) ──────────────────────────────────────────────────────
add("le_nestedarr", "const lv2 = [7]\nconst lv1 = [lv2]\nconst c = [lv1]\n"
    "print(c[0][0][0])\n", "7")
add("le_structobj", "type Circle = { r: i32 }\ntype Sq = { s: i32 }\n"
    "type Shape = Circle | Sq\ntype W = { f: Circle }\n"
    "const w: W = { f: { r: 7 } }\nprint(w.f.r)\n", "7")
add("le_nullist", "const xs: (i32 | null)[] = [7]\nprint(xs[0] ?? 0)\n", "7")

# ── loud check reject (3) ─────────────────────────────────────────────────────
add("lc_type", 'const x: i32 = "seven"\nprint(x)\n', "7")
add("lc_unknown", "print(nosuchname)\n", "7")
add("lc_arity", "function f(a: i32) { print(a) }\nf(1, 2)\n", "7")

for k, v in F.items():
    open(os.path.join(OUT, k + ".vl"), "w").write(v)
json.dump({"expect": E, "coords": {k: {} for k in E}},
          open(os.path.join(OUT, "manifest.json"), "w"))
print("sabotage cells:", len(F))
print("PREDICTED: runs 4 / runs but wrong value 4 / trap_loads 3 / "
      "check-clean invalid wasm 3 / loud emit reject 3 / loud check reject 3 / "
      "compiler trap 0 (unprovokable — recorded)")
