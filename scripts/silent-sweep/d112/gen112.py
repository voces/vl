#!/usr/bin/env python3
"""The D112 grid: a `Map()` reaching a NESTED map's value cell, across every axis the row names.

Axes (the brief's, in order): nesting depth (1/2/3 maps) x leaf value kind x declaredness of
the leaf shape (claimant count 0/1/2 and arm-ness) x how the annotation spells that shape x
which locals carry the container annotation x nullability of the read x how the read is
spelled x declaration order.

D112's own point is that NOTHING is declared in it, so `decl=nodecl` x `ann=none` x
`src=inline` is the filed cell and every other level exists to say what the trigger is NOT.

    python3 scripts/silent-sweep/d112/gen112.py /tmp/d112cells
    JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d112cells <seed.wasm> /tmp/x.json

The expectation is computed HERE, never by the compiler: every cell prints exactly `7`, so a
module that loads and answers wrong grades `runs but wrong value` rather than `runs`.

Cells that are structurally unrepresentable are skipped rather than emitted broken:
`src=declname` needs a declaration, `order=rev` needs two reorderable declaration lines,
`ann=inner`/`both` need a nesting level to annotate, `nul=nul` needs an annotation to spell
`| null` on, and a non-object leaf has no field to reach through `?.` and no shape to declare.
"""
import os
import sys
from collections import Counter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# ── declaredness of the leaf object shape: claimant count 0 / 1 / 2, and arm-ness ──
DECLS = {
    "nodecl": ([], None),
    "plain": (["type Circle = { r: i32 }"], None),
    "plaintwin": (["type Circle = { r: i32 }", "type Dot = { r: i32 }"],
                  ["type Dot = { r: i32 }", "type Circle = { r: i32 }"]),
    "arm": (["type Circle = { r: i32 }", "type Sq = { s: i32 }",
             "type Shape = Circle | Sq"],
            ["type Sq = { s: i32 }", "type Circle = { r: i32 }",
             "type Shape = Circle | Sq"]),
    "armtwin": (["type Circle = { r: i32 }", "type Sq = { s: i32 }",
                 "type Shape = Circle | Sq", "type Dot = { r: i32 }"],
                ["type Dot = { r: i32 }", "type Circle = { r: i32 }",
                 "type Sq = { s: i32 }", "type Shape = Circle | Sq"]),
}

# ── the LEAF value the innermost map holds ────────────────────────────────────
# (spelling of the stored value, the `??` default, the accessor that yields 7,
#  the type spelling for an annotation, whether it is an object shape)
LEAVES = {
    "anon":    ("{ r: n }",  "{ r: 0 }",  ".r",       "{r: i32}",           True),
    "scalar":  ("n",         "0",         "",         "i32",                False),
    "str":     ('"1234567"', '""',        ".length",  "string",             False),
    "list":    ("[n]",       "[0]",       "[0]",      "i32[]",              False),
    "monomap": ("Map()",     "Map()",     '["z"] ?? 0', "{[string]: i32}",  False),
}

READS = ["coal", "coalvar", "getm", "opt"]
ANNS = ["none", "outer", "inner", "both"]
NULS = ["nonul", "nul"]
ORDERS = ["norm", "rev"]
DEPTHS = [1, 2, 3]


def leaf_ty(leaf, src):
    """The leaf VALUE type as an annotation spells it."""
    if leaf == "anon":
        return "Circle" if src == "declname" else "{r: i32}"
    return LEAVES[leaf][3]


def map_ty(depth_from_leaf, leaf, src, nul):
    """`{[string]: …}` wrapped `depth_from_leaf` times around the leaf type."""
    t = leaf_ty(leaf, src)
    for i in range(depth_from_leaf):
        t = "{[string]: " + t + "}"
        # the NULLABILITY axis sits on the value cell the read crosses: every
        # level below the outermost is spelled `… | null`.
        if nul == "nul" and i < depth_from_leaf - 1:
            t = t + " | null"
    return t


def gen_one(depth, leaf, decl, src, ann, nul, read, order):
    lv, dflt, acc, _lty, is_obj = LEAVES[leaf]
    lines = []
    decl_lines = DECLS[decl][1] if order == "rev" else DECLS[decl][0]
    lines += decl_lines
    lines.append("function mk(n: i32) {")
    # level 1 is the INNERMOST map (it holds the leaf); level `depth` is returned.
    for lvl in range(1, depth + 1):
        outermost = (lvl == depth)
        want_ann = (ann == "both"
                    or (ann == "outer" and outermost)
                    or (ann == "inner" and not outermost))
        a = ""
        if want_ann:
            a = ": " + map_ty(lvl, leaf, src, nul)
        name = "c" if outermost else ("l%d" % lvl)
        lines.append("  const " + name + a + " = Map()")
        if lvl == 1:
            if leaf == "monomap":
                lines.append("  const z0 = Map()")
                lines.append('  z0["z"] = n')
                lines.append('  ' + name + '["k1"] = z0')
            else:
                lines.append("  " + name + '["k1"] = ' + lv)
        else:
            lines.append("  " + name + '["k%d"] = l%d' % (lvl, lvl - 1))
    lines.append("  return c")
    lines.append("}")

    # `coalvar` needs a same-typed named map to default to, at each level crossed.
    if read == "coalvar":
        for lvl in range(1, depth):
            lines.append("const d%d: %s = Map()" % (lvl, map_ty(lvl, leaf, src, nul)))

    # the READ: walk down from the outermost map to the leaf.
    e = "mk(7)"
    for lvl in range(depth, 1, -1):
        if read == "getm":
            step = '(' + e + ').get("k%d")' % lvl
        else:
            step = "(" + e + ')["k%d"]' % lvl
        if read == "coalvar":
            e = "(" + step + " ?? d%d)" % (lvl - 1)
        else:
            e = "(" + step + " ?? Map())"
    if read == "getm":
        leafread = '(' + e + ').get("k1")'
    else:
        leafread = "(" + e + ')["k1"]'
    if read == "opt":
        expr = "((" + leafread + ")?" + acc + ") ?? 0"
    else:
        expr = "(" + leafread + " ?? " + dflt + ")" + acc
    lines.append("print(" + expr + ")")
    return "\n".join(lines) + "\n"


def skip(depth, leaf, decl, src, ann, nul, read, order):
    is_obj = LEAVES[leaf][4]
    if src == "declname" and decl == "nodecl":
        return "declname needs a declaration"
    if src == "declname" and not is_obj:
        return "a non-object leaf has no declared name"
    if not is_obj and decl != "nodecl":
        return "a non-object leaf has no shape to declare"
    if order == "rev" and DECLS[decl][1] is None:
        return "no two reorderable declaration lines"
    if depth == 1 and ann in ("inner", "both"):
        return "depth 1 has no inner level to annotate"
    if nul == "nul" and ann == "none":
        return "a nullable value cell needs an annotation to spell it"
    if nul == "nul" and depth == 1:
        return "depth 1 crosses no intermediate value cell"
    if read == "opt" and not is_obj:
        return "a non-object leaf has no field to optional-chain"
    if read == "coalvar" and depth == 1:
        return "depth 1 crosses no intermediate map to default"
    return None


def main():
    n = 0
    skips = Counter()
    for depth in DEPTHS:
        for leaf in LEAVES:
            for decl in DECLS:
                for src in ("inline", "declname"):
                    for ann in ANNS:
                        for nul in NULS:
                            for read in READS:
                                for order in ORDERS:
                                    why = skip(depth, leaf, decl, src, ann,
                                               nul, read, order)
                                    if why:
                                        skips[why] += 1
                                        continue
                                    name = "d%d_%s_%s_%s_%s_%s_%s_%s.vl" % (
                                        depth, leaf, decl, src, ann, nul,
                                        read, order)
                                    with open(os.path.join(OUT, name), "w") as f:
                                        f.write(gen_one(depth, leaf, decl, src,
                                                        ann, nul, read, order))
                                    n += 1
    print("cells=%d" % n)
    for why, c in skips.most_common():
        print("  skip %5d  %s" % (c, why))


main()
