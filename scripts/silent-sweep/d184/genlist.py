#!/usr/bin/env python3
"""THE LIST-CONTAINER GRID — the axes D180 / D183 / D184 turn on, crossed.

WHAT EVERY EARLIER GRID HELD CONSTANT, AND WHICH OF THOSE ARE PROMOTED HERE.

  * `d52 d88 d94 d111 d112 d131 d139` and the D156 position grid all build the container as
    a **Map()**.  The LIST spelling of the same coordinate was never generated — that is
    D184's whole provenance.  **`elem` is promoted**: list / map / bare, so a map cell and
    its list twin exist at every other coordinate.
  * Every one of them delivers the inner container as an **inline literal or a local**.
    D183 is the same coordinate with a **generic conduit** between the literal and the read,
    and D180 is the same coordinate with an **IDENT** element instead of a nested literal.
    **`deliv` and `conduit` are promoted** — neither has ever been an axis.
  * The census's `annpos` axis annotates the OUTERMOST binding only.  D180's deciding axis is
    **WHICH INTERMEDIATE level carries the annotation**.  **`annpat` is promoted** and crossed
    against **`depth`**, which no grid has varied at all.
  * Every grid picked ONE leaf type (i32, or a declared struct).  D180's `i32` control is a
    LOUD emit reject and its `string` twin is silent — the axis decides the OUTCOME CLASS.
    **`rep` is promoted** over the nine leaves the language can put in a list.
  * D180's module-scope control is loud and its in-function twin is silent, so **`escope` is
    promoted** rather than fixed at whichever one the row was found in.

WHAT THIS GRID STILL HOLDS CONSTANT, stated so the next reader can promote it:
  keys are always `string`; the outer container is always a LIST (the map-outer cross is the
  census's block C); no `| null` anywhere; no closures; one element per container; no `order`
  axis (declarations are emitted in one order).

EXPECTATION IS COMPUTED HERE, never read off the compiler: every cell prints `7`.

Usage: genlist.py <outdir> --block L|M|N
"""
import itertools, json, os, sys

# rep -> (type spelling, canonical value, default value, predicate template on {X})
REPS = {
    "i32":    ("i32",     "7",       "0",       "{X} == 7"),
    "str":    ("string",  '"seven"', '""',      '{X} == "seven"'),
    "f64":    ("f64",     "7.5",     "0.5",     "{X} > 7.0"),
    "f32":    ("f32",     "7.5",     "0.5",     "{X} > 7.0"),
    "i64":    ("i64",     "7",       "0",       "{X} == 7"),
    "bool":   ("boolean", "true",    "false",   "{X}"),
    "strlit": ("K",       '"p"',     '"q"',     '{X} == "p"'),
    "struct": ("Circle",  "{ r: 7 }", "{ r: 0 }", "{X}.r == 7"),
    "arm":    ("Circle",  "{ r: 7 }", "{ r: 0 }", "{X}.r == 7"),
}
NOMINAL_REPS = ("struct", "arm")


def prelude(rep, nominal):
    """The declarations a cell needs: the leaf's own type, plus the nominal ingredients."""
    out = []
    if rep == "strlit":
        out.append('type K = "p" | "q"')
    if rep in NOMINAL_REPS:
        out.append("type Circle = { r: i32 }")
        if rep == "arm" or nominal in ("union", "twinunion"):
            out.append("type Sq = { s: i32 }")
            out.append("type Shape = Circle | Sq")
        if nominal in ("twin", "twinunion"):
            out.append("type Dot = { r: i32 }")
    return out


def elem_ty(elem, rep):
    t = REPS[rep][0]
    if elem == "bare":
        return t
    if elem == "list":
        return t + "[]"
    return "{[string]: " + t + "}"


def outer_ty(elem, rep, depth):
    return elem_ty(elem, rep) + "[]" * (depth - 1)


def build_elem(elem, rep, nm, canon):
    """Statements that leave the ELEMENT value in a local called `nm`."""
    if elem == "bare":
        return ["const %s = %s" % (nm, canon)]
    if elem == "list":
        return ["const %s = [%s]" % (nm, canon)]
    return ["const %s = Map()" % nm, '%s["k"] = %s' % (nm, canon)]


def read_elem(elem, expr):
    if elem == "bare":
        return expr
    if elem == "list":
        return "(%s)[0]" % expr
    return '((%s)["k"] ?? DEFAULT)' % expr


def cell(c):
    """Render one coordinate to (source, expected-stdout)."""
    rep = c["rep"]; elem = c["elem"]; deliv = c["deliv"]; conduit = c["conduit"]
    annpat = c["annpat"]; escope = c["escope"]; depth = c["depth"]
    nominal = c.get("nominal", "none")
    ty, canon, dflt, pred = REPS[rep]
    L = list(prelude(rep, nominal))

    # ── the element producer, per `deliv` ────────────────────────────────────
    mod, fn = [], []          # module-scope lines, function-body lines
    inner_ann = ": " + elem_ty(elem, rep) if annpat in ("inner", "all") else ""
    body = build_elem(elem, rep, "iv", canon)
    if inner_ann:
        body[0] = body[0].replace("const iv =", "const iv" + inner_ann + " =", 1)

    if deliv == "lit":
        # written straight into the outer literal — no binding at all
        if elem == "bare":
            elemexpr = canon
        elif elem == "list":
            elemexpr = "[%s]" % canon
        else:
            elemexpr = None      # a map has no literal form; caller skips
    elif deliv == "global":
        mod += body
        elemexpr = "iv"
    elif deliv == "call":
        L.append("function mkiv()%s {" % (" : " + elem_ty(elem, rep) if False else ""))
        for b in body:
            L.append("  " + b)
        L.append("  iv")
        L.append("}")
        elemexpr = "mkiv()"
    elif deliv == "param":
        L.append("function thru(x: %s) { x }" % elem_ty(elem, rep))
        (mod if escope == "mod" else fn).extend(body)
        elemexpr = "thru(iv)"
    elif deliv == "field":
        L.append("type W = { f: %s }" % elem_ty(elem, rep))
        (mod if escope == "mod" else fn).extend(body)
        (mod if escope == "mod" else fn).append("const w: W = { f: iv }")
        elemexpr = "w.f"
    else:  # ident
        (mod if escope == "mod" else fn).extend(body)
        elemexpr = "iv"

    if elemexpr is None:
        return None

    # ── the intermediate levels (depth 3 has one), then the outer literal ────
    tgt = mod if escope == "mod" else fn
    cur = "[%s]" % elemexpr
    lvl = 2
    if depth == 3:
        mid_ann = ": " + outer_ty(elem, rep, 2) if annpat in ("mid", "all") else ""
        tgt.append("const mid%s = %s" % (mid_ann, cur))
        cur = "[mid]"
        lvl = 3
    out_ann = ": " + outer_ty(elem, rep, depth) if annpat in ("outer", "all") else ""
    tgt.append("const c%s = %s" % (out_ann, cur))

    # ── the conduit, then the read ───────────────────────────────────────────
    src = "c"
    if conduit == "gen":
        L.append("function idg<T>(x: T): T { x }")
        src = "idg(c)"
    elif conduit == "std":
        L.insert(0, 'import { reverse } from "std:array"')
        src = "reverse(c)"
    inner = src
    for _ in range(depth - 1):
        inner = "(%s)[0]" % inner
    leaf = read_elem(elem, inner).replace("DEFAULT", dflt)
    tgt.append("if %s { print(7) } else { print(0) }" % pred.format(X=leaf))

    L += mod
    if fn:
        L.append("function rd() {")
        L += ["  " + s for s in fn]
        L.append("}")
        L.append("rd()")
    return "\n".join(L) + "\n", "7"


BLOCKS = {
    # THE D180 / D183 CORE: delivery × leaf × conduit × annotation × scope, at the one
    # coordinate both rows sit on (a LIST element, depth 2, nothing nominal).
    "L": dict(deliv=["lit", "ident", "call", "param", "global", "field"],
              rep=list(REPS), conduit=["none", "gen", "std"],
              annpat=["none", "outer", "inner", "all"], escope=["mod", "fn"],
              elem=["list"], depth=[2], nominal=["none"]),
    # D180's OWN axis: which INTERMEDIATE level is annotated, crossed against depth.
    "M": dict(depth=[2, 3], annpat=["none", "outer", "mid", "inner", "all"],
              rep=list(REPS), deliv=["lit", "ident", "call"], escope=["mod", "fn"],
              elem=["list"], conduit=["none"], nominal=["none"]),
    # D184's: the nominal ingredients × the CONTAINER (list vs map vs bare) × delivery.
    "N": dict(nominal=["none", "twin", "union", "twinunion"],
              elem=["list", "map", "bare"], deliv=["lit", "ident", "call", "param"],
              annpat=["none", "outer", "inner", "all"], depth=[2, 3],
              rep=["arm", "struct"], conduit=["none"], escope=["mod"]),
}


def main():
    out = sys.argv[1]
    blk = sys.argv[sys.argv.index("--block") + 1]
    os.makedirs(out, exist_ok=True)
    axes = BLOCKS[blk]
    keys = sorted(axes)
    expect, coords, skips = {}, {}, {}
    n = 0
    for vals in itertools.product(*[axes[k] for k in keys]):
        c = dict(zip(keys, vals))
        # STRUCTURAL SKIPS, named rather than hidden.
        if c["deliv"] == "lit" and c["elem"] == "map":
            skips["a map has no literal form"] = skips.get("a map has no literal form", 0) + 1
            continue
        if c["deliv"] == "lit" and c["annpat"] in ("inner", "all"):
            skips["a literal element has no binding to annotate"] = \
                skips.get("a literal element has no binding to annotate", 0) + 1
            continue
        if c["depth"] == 2 and c["annpat"] == "mid":
            skips["depth 2 has no middle level"] = skips.get("depth 2 has no middle level", 0) + 1
            continue
        if c["depth"] == 3 and c["annpat"] == "mid" and c["deliv"] == "lit":
            skips["a literal element has no binding to annotate"] = \
                skips.get("a literal element has no binding to annotate", 0) + 1
            continue
        r = cell(c)
        if r is None:
            skips["unrepresentable"] = skips.get("unrepresentable", 0) + 1
            continue
        text, exp = r
        name = "%s%05d" % (blk.lower(), n)
        open(os.path.join(out, name + ".vl"), "w").write(text)
        expect[name] = exp
        coords[name] = c
        n += 1
    json.dump({"expect": expect, "coords": coords, "skips": skips, "block": blk,
               "generated": n}, open(os.path.join(out, "manifest.json"), "w"))
    print("block %s: generated=%d" % (blk, n))
    for k in sorted(skips, key=lambda k: -skips[k]):
        print("  skip %6d  %s" % (skips[k], k))


main()
