#!/usr/bin/env python3
"""THE ELEMENT-PAIR GRID (D741/D742) — one list literal, two declared destinations, and
the axis is the ELEMENT TYPE each destination declares.

    python3 gen741.py <outdir>            # write the cells
    python3 gen741.py --verify <outdir>   # regenerate and assert byte-identity
    python3 gen741.py --expect            # the expected-stdout map, for the corpus manifest

WHY IT HAD TO BE BUILT, GIVEN THAT D411'S GRID ALREADY EXISTS. D411 varies the SPELLING
of the two destinations (`bind`, `mapstore`, `callarg`, `ret`, …) and holds the element
pair FIXED at `(Circle, Shape)` in all 103 of its cells. That grid can therefore say which
SYNTACTIC deliveries the two-destination refusal reaches, and it cannot say anything at all
about WHERE THE LINE IS — which pairs of element types the compiler refuses and which it
admits. This grid is the transpose: it fixes the spelling at the simplest one and varies
the element pair.

That axis is the one a CHECKER-side statement of the rule turns on. D661B refused array
invariance and asked for "an element-type hole unified across destinations" instead. Whether
that is buildable depends entirely on whether the line today's compiler draws is describable
in the TYPE system's vocabulary. This grid answers that, and the answer is NO — see D741.

THREE BLOCKS.

  `eager_`  the literal is NON-EMPTY (`[{ r: 7 }]`). Its element is inferred bottom-up by
     `checkArrayLitNode` (typecheck.vl:33211) and frozen before any destination is known, so
     every destination is admitted independently by array covariance
     (`assignableGo`'s TyArray arm, typecheck.vl:16480).

  `hole_`   the identical grid with an EMPTY literal (`[]`). Its element is the `-1` open
     hole, and `constrainEmptyD` (typecheck.vl:1537, `s.aElem = d.aElem`) pins it from the
     FIRST destination — which is destination-driven element unification, already built,
     already positioned at the second destination, already worded in the language's own
     terms. The two blocks ask ONE question and the compiler answers it two ways; the
     disagreement is the measurement.

  `w`/`o`   the two hand-written witnesses and their ablations. `w*` is D741's trap (the
     quadrant the compiler ADMITS is not sound); `o*` is D742's order dependence (the same
     destination pair, swapped, is a soundness violation one way round and a clean
     diagnosis the other).

THE ELEMENT AXIS, seven spellings chosen so the literal `{ r: 7 }` is assignable to every
one of them, spanning both storage classes and both kinds of union identity:

    Circle       a declared struct                        -- plain struct row  (K1)
    inlineobj    `{ r: i32 }`, the same shape unnamed     -- plain struct row  (K1)
    CircleNull   `Circle | null`                          -- niche nullable
    Shape        `Circle | Sq`                            -- union box         (K2)
    Animal       `Circle | Sq` under a SECOND name        -- union box         (K2)
    Other        `Circle | Tri`, a DIFFERENT member set   -- union box         (K2)
    CircleStr    `Circle | string`, a mixed-rep union     -- union box         (K2)

`Animal` is `Shape`'s structural twin under another declaration and `Other` is a genuinely
different union: together they separate "same type" from "same storage", which is exactly
the distinction a type-level rule and a rep-level rule disagree about.
"""
import itertools
import json
import os
import sys

PRELUDE = """type Circle = { r: i32 }
type Sq = { s: i32 }
type Tri = { t: i32 }
type Shape = Circle | Sq
type Animal = Circle | Sq
type Other = Circle | Tri
"""

ELEMS = {
    "Circle": "Circle",
    "inlineobj": "{ r: i32 }",
    "CircleNull": "Circle | null",
    "Shape": "Shape",
    "Animal": "Animal",
    "Other": "Other",
    "CircleStr": "Circle | string",
}

# `w*` — D741. The quadrant the compiler ADMITS (two K2 destinations) is not sound: one
# un-annotated literal reaches two UNRELATED declared unions, a store through one handle
# puts a value outside the other union into the list, and reading it back through a
# narrowing traps. Each `w` cell removes exactly one ingredient from `w0_base`.
#
# `o*` — D742. The empty literal's pin is FIRST-DESTINATION-WINS, so the same two
# destinations answer differently depending on source order, and one of the two orders is
# a check-clean invalid module. `o3`/`o4` are the non-empty twins, which are loud both ways.
WITNESSES = {
    "w0_base": """function f() {
  const xs = [{ r: 7 }]
  const a: Shape[] = xs
  const b: Other[] = xs
  b[0] = { t: 3 }
  const e = a[0]
  match e { Circle => print(100 + e.r), Sq => print(200 + e.s) }
}
f()
""",
    "w1_annotated_src": """function f() {
  const xs: Shape[] = [{ r: 7 }]
  const b: Other[] = xs
  b[0] = { t: 3 }
  const e = xs[0]
  match e { Circle => print(100 + e.r), Sq => print(200 + e.s) }
}
f()
""",
    "w2_no_store": """function f() {
  const xs = [{ r: 7 }]
  const a: Shape[] = xs
  const b: Other[] = xs
  const e = a[0]
  match e { Circle => print(100 + e.r), Sq => print(200 + e.s) }
}
f()
""",
    "w3_one_dest": """function f() {
  const xs = [{ r: 7 }]
  const a: Shape[] = xs
  const e = a[0]
  match e { Circle => print(100 + e.r), Sq => print(200 + e.s) }
}
f()
""",
    "w4_same_union": """function f() {
  const xs = [{ r: 7 }]
  const a: Shape[] = xs
  const b: Shape[] = xs
  b[0] = { s: 3 }
  const e = a[0]
  match e { Circle => print(100 + e.r), Sq => print(200 + e.s) }
}
f()
""",
    "w5_no_narrow": """function f() {
  const xs = [{ r: 7 }]
  const a: Shape[] = xs
  const b: Other[] = xs
  b[0] = { t: 3 }
  print(a.length)
}
f()
""",
    "w6_params": """function poke(p: Other[]) { p[0] = { t: 3 } }
function look(p: Shape[]) { const e = p[0]; match e { Circle => print(100 + e.r), Sq => print(200 + e.s) } }
function f() {
  const xs = [{ r: 7 }]
  poke(xs)
  look(xs)
}
f()
""",
    "o1_hole_k1_first": """function f() {
  const xs = []
  const a: Circle[] = xs
  const b: Shape[] = xs
  print(a.length)
  print(b.length)
}
f()
""",
    "o2_hole_k2_first": """function f() {
  const xs = []
  const b: Shape[] = xs
  const a: Circle[] = xs
  print(b.length)
  print(a.length)
}
f()
""",
    "o3_eager_k1_first": """function f() {
  const xs = [{ r: 7 }]
  const a: Circle[] = xs
  const b: Shape[] = xs
  print(a.length)
  print(b.length)
}
f()
""",
    "o4_eager_k2_first": """function f() {
  const xs = [{ r: 7 }]
  const b: Shape[] = xs
  const a: Circle[] = xs
  print(b.length)
  print(a.length)
}
f()
""",
}


def pair(lit, e1, e2):
    return f"""{PRELUDE}function f() {{
  const xs = {lit}
  const a: ({e1})[] = xs
  const b: ({e2})[] = xs
  print(a.length)
  print(b.length)
}}
f()
"""


def control(lit, e1):
    return f"""{PRELUDE}function f() {{
  const xs = {lit}
  const a: ({e1})[] = xs
  print(a.length)
}}
f()
"""


# STDOUT EACH CELL MUST PRODUCE IF IT RUNS, stated HERE and never read off a compiler
# (`gradecensus.py`: "The expectation comes from the generator's manifest").
#
# The pair and control cells are mechanical: the eager literal holds one element and the
# empty one holds none, so every `print(x.length)` is 1 or 0 by construction.
#
# THE `w` CELLS NEED A WORD, because `w0`/`w6` are programs no sound compiler should run
# at all. Their expectation is the value the READER's own destination justifies — 107, the
# Circle that `a` was built from — which is what `w2_no_store` and `w3_one_dest` print and
# what `w0` would print if the illegal store through the other union's handle had not been
# admitted. So "runs and prints 107" is the only acceptable RUNNING outcome, a refusal
# grades as movement rather than regression, and today's `wasm trap: cast failure` is
# neither. `w4_same_union` is the legal twin: one union, a real `Sq` stored, 203 correct.
EXPECT_W = {
    "w0_base": "107",
    "w1_annotated_src": "107",
    "w2_no_store": "107",
    "w3_one_dest": "107",
    "w4_same_union": "203",
    "w5_no_narrow": "1",
    "w6_params": "107",
    "o1_hole_k1_first": "0\n0",
    "o2_hole_k2_first": "0\n0",
    "o3_eager_k1_first": "1\n1",
    "o4_eager_k2_first": "1\n1",
}


def cells():
    """{cell name: (source, expected stdout)}."""
    out = {}
    for tag, lit, n in (("eager", "[{ r: 7 }]", "1"), ("hole", "[]", "0")):
        for e1, e2 in itertools.product(ELEMS, ELEMS):
            out[f"d741_{tag}_{e1}__{e2}"] = (pair(lit, ELEMS[e1], ELEMS[e2]), n + "\n" + n)
        for e1 in ELEMS:
            out[f"d741_{tag}_{e1}__none"] = (control(lit, ELEMS[e1]), n)
    for name, body in WITNESSES.items():
        out[f"d741_{name}"] = (PRELUDE + body, EXPECT_W[name])
    return out


def main():
    args = [a for a in sys.argv[1:] if a not in ("--verify", "--expect")]
    verify = "--verify" in sys.argv
    expect_only = "--expect" in sys.argv
    if expect_only:
        args = args or [""]
    if len(args) != 1:
        print(__doc__.strip())
        return 2
    outdir = args[0]
    made = cells()
    if expect_only:
        json.dump({k: v[1] for k, v in sorted(made.items())}, sys.stdout, indent=1)
        return 0
    os.makedirs(outdir, exist_ok=True)
    bad = 0
    for name, (src, _) in sorted(made.items()):
        path = os.path.join(outdir, name + ".vl")
        if verify:
            have = open(path).read() if os.path.exists(path) else None
            if have != src:
                print(f"DIFFERS: {path}")
                bad += 1
        else:
            open(path, "w").write(src)
    if verify:
        print(f"{len(made)} cells verified · {bad} DIFFER")
        return 1 if bad else 0
    print(f"{len(made)} cells written -> {outdir}")
    return 0


sys.exit(main())
