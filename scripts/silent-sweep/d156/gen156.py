#!/usr/bin/env python3
"""The D156 / D158 grid: an arm-valued map chain, across the ANNOTATION-POSITION axis.

The axis no earlier grid has. D88/D100 and D112 both vary WHICH LEVEL of a nested map is
annotated (`ann` = none/outer/inner/both); neither varies WHERE the deciding annotation
SITS. Every carrier in the `synthRetPinAnn` / `synthEmptyListAnn` / `synthDstPinAnn` family
reads a DELIVERY — a destination's annotation, a call parameter's, a declared result's — and
D158's whole content is that the only nominal claim in its program is at a READ. A grid
whose annotation axis is "which level" cannot separate those; this one's is "which
position".

    python3 scripts/silent-sweep/d156/gen156.py   /tmp/d156cells
    JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d156cells <seed.wasm> /tmp/x.json

`grade88.py` is reused verbatim — it takes the seed as an argument, so every compiler is
measured with ONE host binary and no tree switching, and one grader across the D88, D112 and
D156 grids is what makes their residues comparable. `JOBS` defaults to 6 and nothing here
raises it (`vl check` peaks around 650 MB RSS).

**The expectation is computed HERE, never by the compiler**: every cell prints exactly `7`,
so a module that loads and answers wrong grades `runs but wrong value` rather than `runs`.
Each leaf kind reaches 7 by its own route — the object shape through `.r`, the scalar
directly, the inner mono map through `["z"]`.

## Axes

- **`pos`** — WHERE the one nominal annotation sits. `none` (nowhere); `dest` (on the
  binding/parameter that receives the outer map); `delivery` (a `thru(x: T)` call the map is
  passed to); `retann` (the building function's declared result); `read` (only at the read
  site, as the annotated `??` default at each crossed level — **D158's coordinate**);
  `bindann` (on the local the read's SOURCE is bound to, outside the builder).
- **`depth`** 1/2/3 nested maps — D156 is a NESTED map and a one-level grid cannot see it.
- **`leaf`** (`arm` / `anon` / `struct` / `scalar` / `map`) — the innermost value, and how
  an annotation spells it. `arm` is D156's own coordinate; `struct` is the declared
  non-arm control that says the seam is variant⇄struct and not shape-vs-name; `scalar` and
  `map` are the value kinds with no nominal claimant at all.
- **`twin`** — whether an exact layout twin (`type Dot = { r: i32 }`) is declared. D139's
  controls make it required for the silent class, so a grid without it measures a mixture.
- **`storage`** (`local` / `global` / `param` / `callres`) — where the OUTER map is bound.
  D139 was storage-class DEPENDENT and D155 is not, so a grid that holds this constant
  cannot tell those two rows apart. `callres` is also the coordinate at which
  `armPinLitInit` declines (the initializer is a call, not a literal producer).
- **`order`** (`norm` / `rev`) — declaration order of the type block. The mv slot find is
  un-hinted for a caller with no recorded type, so it resolves whichever of two same-canon
  slots was minted first; order is how that becomes visible.

Cells that are structurally unrepresentable are SKIPPED rather than emitted broken:
`leaf=struct` needs the twin declaration to exist, and `pos=retann` needs a function whose
result IS the outer map (so it does not exist at `global` or `param` storage).
"""
import os
import sys
from collections import Counter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

BASE_DECLS = [
    "type Circle = { r: i32 }",
    "type Sq = { s: i32 }",
    "type Shape = Circle | Sq",
]
TWIN_DECL = "type Dot = { r: i32 }"

# leaf -> (annotation spelling, stored value, `??` default, accessor reaching 7)
LEAVES = {
    "arm":    ("Circle",            "{ r: %s }", "{ r: 0 }", ".r"),
    "anon":   ("{r: i32}",          "{ r: %s }", "{ r: 0 }", ".r"),
    "struct": ("Dot",               "{ r: %s }", "{ r: 0 }", ".r"),
    "scalar": ("i32",               "%s",        "0",        ""),
    "map":    ("{[string]: i32}",   None,        "Map()",    '["z"] ?? 0'),
}

POS = ["none", "dest", "delivery", "retann", "read", "bindann"]
DEPTHS = [1, 2, 3]
TWINS = ["twin", "notwin"]
STORAGE = ["local", "global", "param", "callres"]
ORDERS = ["norm", "rev"]


def map_ty(levels, leaf):
    t = LEAVES[leaf][0]
    for _ in range(levels):
        t = "{[string]: " + t + "}"
    return t


def chain(depth, leaf, nexpr, indent, outer_name, outer_decl):
    """The build statements: `l1` .. `l(depth-1)` then the outer map `outer_name`."""
    out = []
    stored = LEAVES[leaf][1]
    for lvl in range(1, depth + 1):
        outermost = lvl == depth
        name = outer_name if outermost else ("l%d" % lvl)
        if outermost:
            out.append(indent + outer_decl)
        else:
            out.append(indent + "const %s = Map()" % name)
        if lvl == 1:
            if leaf == "map":
                out.append(indent + "const z0 = Map()")
                out.append(indent + 'z0["z"] = ' + nexpr)
                out.append(indent + name + '["k1"] = z0')
            else:
                out.append(indent + name + '["k1"] = ' + (stored % nexpr))
        else:
            out.append(indent + name + '["k%d"] = l%d' % (lvl, lvl - 1))
    return out


def gen_one(pos, depth, leaf, twin, storage, order):
    ann = map_ty(depth, leaf)
    lines = list(BASE_DECLS)
    if twin == "twin":
        lines.append(TWIN_DECL)
    if order == "rev":
        lines.reverse()

    if pos == "delivery":
        lines.append("function thru(x: %s) { return x }" % ann)

    # ── the builder ───────────────────────────────────────────────────────────
    dest_ann = ": " + ann if pos == "dest" else ""
    ret_ann = ": " + ann if pos == "retann" else ""
    deliver = ["  thru(c)"] if pos == "delivery" else []

    if storage == "local":
        lines.append("function mk(n: i32)%s {" % ret_ann)
        lines += chain(depth, leaf, "n", "  ", "c", "const c%s = Map()" % dest_ann)
        lines += deliver
        lines.append("  return c")
        lines.append("}")
        src = "mk(7)"
    elif storage == "callres":
        lines.append("function mkc() { return Map() }")
        lines.append("function mk(n: i32)%s {" % ret_ann)
        lines += chain(depth, leaf, "n", "  ", "c", "const c%s = mkc()" % dest_ann)
        lines += deliver
        lines.append("  return c")
        lines.append("}")
        src = "mk(7)"
    elif storage == "global":
        lines += chain(depth, leaf, "7", "", "c", "const c%s = Map()" % dest_ann)
        if pos == "delivery":
            lines.append("thru(c)")
        src = "c"
    else:  # param — the outer map is created by the caller and filled through a parameter
        lines.append("function fill(c%s, n: i32) {" % dest_ann)
        inner = chain(depth, leaf, "n", "  ", "c", "// outer supplied by the caller")
        # drop the placeholder declaration line for the outer map
        lines += [ln for ln in inner if "outer supplied" not in ln]
        lines += deliver
        lines.append("}")
        lines.append("const c = Map()")
        lines.append("fill(c, 7)")
        src = "c"

    # ── the read ──────────────────────────────────────────────────────────────
    if pos == "read":
        for lvl in range(1, depth):
            lines.append("const d%d: %s = Map()" % (lvl, map_ty(lvl, leaf)))
        lines.append("const dleaf: %s = %s" % (LEAVES[leaf][0], LEAVES[leaf][2]))

    if pos == "bindann":
        lines.append("const m: %s = %s" % (ann, src))
        src = "m"

    e = src
    for lvl in range(depth, 1, -1):
        dflt = "d%d" % (lvl - 1) if pos == "read" else "Map()"
        e = "((%s)[\"k%d\"] ?? %s)" % (e, lvl, dflt)
    leafdflt = "dleaf" if pos == "read" else LEAVES[leaf][2]
    e = "((%s)[\"k1\"] ?? %s)" % (e, leafdflt)
    lines.append("print((%s)%s)" % (e, LEAVES[leaf][3]))
    return "\n".join(lines) + "\n"


skips = Counter()
n = 0
for pos in POS:
    for depth in DEPTHS:
        for leaf in LEAVES:
            for twin in TWINS:
                for storage in STORAGE:
                    for order in ORDERS:
                        if leaf == "struct" and twin != "twin":
                            skips["leaf=struct needs the twin declaration"] += 1
                            continue
                        if pos == "retann" and storage in ("global", "param"):
                            skips["pos=retann needs a function whose result is the map"] += 1
                            continue
                        name = "%s_%s_d%d_%s_%s_%s.vl" % (pos, storage, depth, leaf, twin, order)
                        open(os.path.join(OUT, name), "w").write(
                            gen_one(pos, depth, leaf, twin, storage, order)
                        )
                        n += 1
print("cells:", n)
for k in sorted(skips):
    print("  skip %5d  %s" % (skips[k], k))
