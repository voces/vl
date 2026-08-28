#!/usr/bin/env python3
"""THE BOX-vs-ARM GRIDS — the axes D243 / D244 / D200 turn on, crossed.

Two blocks.  `P` is `scripts/silent-sweep/d184/genlist.py`'s block N with three axes
PROMOTED; `Q` is a new population for the union-BOX <-> bare-ARM seam, which no list grid
reaches at all.

WHAT BLOCK N HELD CONSTANT, AND WHAT BLOCK P PROMOTES.

  * **`escope` — block N is `escope=["mod"]`.**  Every one of its 640 cells is a module
    global.  D244's whole content is that the module-scope spelling is silent and the
    IN-FUNCTION spelling of the identical six lines RUNS, so the axis the block fixed is
    the axis that decides the outcome.  Promoted to mod / fn.
  * **`depth` — block M and block N stop at 3.**  D243 is D184 with one more `[]`, and its
    cause is a SCAN BOUND (`dstPinPushAnn` descends one ArrayLit level), so a bound at 3
    cannot distinguish "fixed" from "fixed one level further out".  Promoted to 2 / 3 / 4.
  * **`nest` — no grid has ever varied it.**  Every cell of every earlier list grid gives
    each container level its own BINDING (`const mid = [iv]  const c = [mid]`).  D243's
    filed witness writes the outer levels as ONE nested literal (`const c = [[iv]]`), and
    that is a different program: the binding form gives `dstPinSrcIs` an alias to follow,
    the literal form gives it a nested `ArrayLit` to descend.  Promoted to bind / lit.

WHAT BLOCK P STILL HOLDS CONSTANT, stated so the next reader can promote it rather than
rediscover it: map keys are always `string`; the OUTER container is always a LIST; no
`| null`; no closures; one element per container; no `order` axis; no conduit (block L's
axis); `annpat` omits `mid` (block M's axis).

BLOCK Q — THE BOX <-> ARM SEAM, which is not a container question at all.

D200 is `store=global x twin=exact x deliv=box-argument`, and the three controls its row
files are three points of a grid nobody built: the value's PRODUCER (which decides whether
it reps as the kind-8 arm or as the `{tag,value}` box) crossed against the DESTINATION
(which decides which of the two the position wants).  Block Q is that cross, with the
layout twin as the third axis because it is what turns a loud refusal into a silent one.

EXPECTATION IS COMPUTED HERE, never read off the compiler: every cell prints `7`.

Usage: genbox.py <outdir> --block P|Q
"""
import itertools
import json
import os
import sys

# rep -> (type spelling, canonical value, default value, predicate template on {X})
REPS = {
    "struct": ("Circle", "{ r: 7 }", "{ r: 0 }", "{X}.r == 7"),
    "arm": ("Circle", "{ r: 7 }", "{ r: 0 }", "{X}.r == 7"),
}
NOMINAL_REPS = ("struct", "arm")


def prelude(rep, nominal):
    """The declarations a cell needs — genlist.py's, verbatim, so the two blocks' `nominal`
    axis means the same thing in both."""
    out = []
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


def cell_p(c):
    """One block-P coordinate -> (source, expected-stdout)."""
    rep = c["rep"]
    elem = c["elem"]
    deliv = c["deliv"]
    annpat = c["annpat"]
    escope = c["escope"]
    depth = c["depth"]
    nest = c["nest"]
    nominal = c["nominal"]
    ty, canon, dflt, pred = REPS[rep]
    L = list(prelude(rep, nominal))

    mod, fn = [], []
    inner_ann = ": " + elem_ty(elem, rep) if annpat in ("inner", "all") else ""
    body = build_elem(elem, rep, "iv", canon)
    if inner_ann:
        body[0] = body[0].replace("const iv =", "const iv" + inner_ann + " =", 1)

    if deliv == "lit":
        if elem == "bare":
            elemexpr = canon
        elif elem == "list":
            elemexpr = "[%s]" % canon
        else:
            return None
    elif deliv == "call":
        L.append("function mkiv() {")
        for b in body:
            L.append("  " + b)
        L.append("  iv")
        L.append("}")
        elemexpr = "mkiv()"
    elif deliv == "param":
        L.append("function thru(x: %s) { x }" % elem_ty(elem, rep))
        (mod if escope == "mod" else fn).extend(body)
        elemexpr = "thru(iv)"
    else:  # ident
        (mod if escope == "mod" else fn).extend(body)
        elemexpr = "iv"

    tgt = mod if escope == "mod" else fn
    cur = "[%s]" % elemexpr
    if nest == "bind":
        for lvl in range(2, depth):
            tgt.append("const mid%d = %s" % (lvl, cur))
            cur = "[mid%d]" % lvl
    else:  # every intermediate level is written INSIDE the outer literal
        for _ in range(2, depth):
            cur = "[%s]" % cur
    out_ann = ": " + outer_ty(elem, rep, depth) if annpat in ("outer", "all") else ""
    tgt.append("const c%s = %s" % (out_ann, cur))

    inner = "c"
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


# ── block Q ──────────────────────────────────────────────────────────────────────────
#
# `src` — how the arm-shaped value is PRODUCED, which is what decides its rep.  Each entry
# is (module-scope lines, function-scope lines, the expression that reads it, extra decls).
# `gbare` and `lbare` are the same six characters at two storage classes and rep
# DIFFERENTLY today, which is the fact D244 turns on.

SRCS = ("gann", "gbare", "lann", "lbare", "pann", "call", "callinf", "cap")
DSTS = ("bare", "uparam", "uret", "uglob", "ulocal", "ulist", "umapv",
        "aparam", "alamparam", "alist")


def cell_q(c):
    src = c["src"]
    dst = c["dst"]
    twin = c["twin"]
    L = ["type Circle = { r: i32 }", "type Sq = { s: i32 }", "type Shape = Circle | Sq"]
    if twin == "exact":
        L.append("type Dot = { r: i32 }")
    mod, fn = [], []
    scope_is_fn = src in ("lann", "lbare", "pann", "cap")

    if src == "gann":
        mod.append("const v: Circle = { r: 7 }")
        vexpr = "v"
    elif src == "gbare":
        mod.append("const v = { r: 7 }")
        vexpr = "v"
    elif src == "lann":
        fn.append("const v: Circle = { r: 7 }")
        vexpr = "v"
    elif src == "lbare":
        fn.append("const v = { r: 7 }")
        vexpr = "v"
    elif src == "pann":
        L.append("function mkc(): Circle { { r: 7 } }")
        fn.append("const v = mkc()")
        L.append("function withp(p: Circle) { p }")
        fn.append("const v2 = withp(v)")
        vexpr = "v2"
    elif src == "call":
        L.append("function mkc(): Circle { { r: 7 } }")
        vexpr = "mkc()"
    elif src == "callinf":
        L.append("function mkc() { { r: 7 } }")
        vexpr = "mkc()"
    else:  # cap — the value is a CAPTURE of a nested reader
        fn.append("const v: Circle = { r: 7 }")
        vexpr = "v"

    tgt = fn if scope_is_fn else mod
    if dst == "bare":
        read = "(%s).r == 7" % vexpr
    elif dst == "uparam":
        L.append("function area(s: Shape) { if s is Circle { return s.r } else { return 0 } }")
        read = "area(%s) == 7" % vexpr
    elif dst == "uret":
        L.append("function box(x: Circle): Shape { x }")
        tgt.append("const b = box(%s)" % vexpr)
        read = "(if b is Circle { b.r } else { 0 }) == 7"
    elif dst == "uglob":
        # a module GLOBAL typed as the union, assigned the value
        mod.insert(0, "let g: Shape = { s: 0 }")
        tgt.append("g = %s" % vexpr)
        read = "(if g is Circle { g.r } else { 0 }) == 7"
    elif dst == "ulocal":
        tgt.append("const u: Shape = %s" % vexpr)
        read = "(if u is Circle { u.r } else { 0 }) == 7"
    elif dst == "ulist":
        tgt.append("const xs: Shape[] = [%s]" % vexpr)
        tgt.append("const u = (xs)[0]")
        read = "(if u is Circle { u.r } else { 0 }) == 7"
    elif dst == "umapv":
        tgt.append("const m: {[string]: Shape} = Map()")
        tgt.append('m["k"] = %s' % vexpr)
        tgt.append('const u = (m)["k"] ?? { s: 0 }')
        read = "(if u is Circle { u.r } else { 0 }) == 7"
    elif dst == "aparam":
        L.append("function idc(x: Circle): Circle { x }")
        read = "idc(%s).r == 7" % vexpr
    elif dst == "alamparam":
        L.append("const lamc = (x: Circle) => x")
        read = "lamc(%s).r == 7" % vexpr
    else:  # alist — an ARM-element list
        tgt.append("const xs: Circle[] = [%s]" % vexpr)
        read = "(xs)[0].r == 7"

    tgt.append("if %s { print(7) } else { print(0) }" % read)
    L += mod
    if fn:
        L.append("function rd() {")
        L += ["  " + s for s in fn]
        L.append("}")
        L.append("rd()")
    return "\n".join(L) + "\n", "7"


BLOCKS = {
    # Block N's coordinate with `escope`, `depth` and `nest` promoted.
    "P": dict(nominal=["none", "twin", "union", "twinunion"],
              elem=["list", "map", "bare"], deliv=["lit", "ident", "call", "param"],
              annpat=["none", "outer", "inner", "all"], depth=[2, 3, 4],
              rep=["arm", "struct"], escope=["mod", "fn"], nest=["bind", "lit"]),
    # The box <-> arm seam: producer x destination x layout twin.
    "Q": dict(src=list(SRCS), dst=list(DSTS), twin=["none", "exact"]),
}


def main():
    out = sys.argv[1]
    blk = sys.argv[sys.argv.index("--block") + 1]
    os.makedirs(out, exist_ok=True)
    axes = BLOCKS[blk]
    keys = sorted(axes)
    expect, coords, skips = {}, {}, {}
    n = 0

    def skip(why):
        skips[why] = skips.get(why, 0) + 1

    for vals in itertools.product(*[axes[k] for k in keys]):
        c = dict(zip(keys, vals))
        if blk == "P":
            # STRUCTURAL SKIPS, named rather than hidden.
            if c["deliv"] == "lit" and c["elem"] == "map":
                skip("a map has no literal form")
                continue
            if c["deliv"] == "lit" and c["annpat"] in ("inner", "all"):
                skip("a literal element has no binding to annotate")
                continue
            if c["depth"] == 2 and c["nest"] == "lit":
                skip("depth 2 has no intermediate level, so nest is degenerate")
                continue
            r = cell_p(c)
        else:
            r = cell_q(c)
        if r is None:
            skip("unrepresentable")
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
