#!/usr/bin/env python3
"""
D52 grid generator.

Seven axes.  Every cell prints exactly one line, `7`, computed from the program's own
semantics without consulting the compiler.

  decl   arm | plain | nodecl        -- is the target type a UNION ARM, a plain struct,
                                        or not declared at all (inline shape)?
                                        A previous 900-cell grid declared the union in
                                        every file, so it was a CONSTANT and not an axis.
  ann    localann | retann | both | none | otherarm
                                     -- WHERE the annotation sits.  `localann` is D52,
                                        `retann` is D39 (closed), `otherarm` annotates a
                                        DIFFERENT same-layout arm of the same union.
  twin   none | exact | namediff | armtwin | late
  cont   bare | list | field | mapval | nested
  cons   ret | bound | pass | inline | store
  route  fn | gen | std              -- direct, through a hand-written generic, or
                                        through `std:array`'s `mapIndexed`.
  order  before | after              -- the type-declaration block before or after the
                                        functions that use it.

`pass` delivers the value to a callee whose PARAM is annotated and whose RESULT is not,
so callee delivery is varied rather than held fixed.
"""
import itertools
import os
import sys

DECLS = ["arm", "plain", "nodecl"]
ANNS = ["localann", "retann", "both", "none", "otherarm"]
TWINS = ["none", "exact", "namediff", "armtwin", "late"]
CONTS = ["bare", "list", "field", "mapval", "nested"]
CONSS = ["ret", "bound", "pass", "inline", "store"]
ROUTES = ["fn", "gen", "std"]
ORDERS = ["before", "after"]


def target_name(decl, ann):
    """The type the value is annotated AS."""
    if decl == "nodecl":
        return "{ r: i32 }"
    if ann == "otherarm":
        return "Ring"
    return "Circle"


def base_decls(decl, ann):
    """The declarations that define the target type."""
    if decl == "nodecl":
        return []
    if decl == "plain":
        return ["type Circle = { r: i32 }"]
    # arm
    if ann == "otherarm":
        # A SECOND same-layout arm.  A structural field-set scan finds `Circle` first;
        # the annotation names `Ring`.  Both print 7, so only the module's validity
        # separates them -- which is exactly the probe.
        return [
            "type Circle = { r: i32 }",
            "type Ring = { r: i32 }",
            "type Sq = { s: i32 }",
            "type Shape = Circle | Ring | Sq",
        ]
    return [
        "type Circle = { r: i32 }",
        "type Sq = { s: i32 }",
        "type Shape = Circle | Sq",
    ]


def twin_decls(twin):
    """(decls placed with the block, decls placed AFTER the functions)."""
    if twin == "none":
        return [], []
    if twin == "exact":
        return ["type Dot = { r: i32 }"], []
    if twin == "namediff":
        return ["type Dot = { q: i32 }"], []
    if twin == "armtwin":
        return [
            "type Dot = { r: i32 }",
            "type Ring2 = { g: i32 }",
            "type Other = Dot | Ring2",
        ], []
    if twin == "late":
        return [], ["type Dot = { r: i32 }"]
    raise AssertionError(twin)


def cont_type(cont, t):
    if cont == "bare":
        return t
    if cont == "list":
        return t + "[]"
    if cont == "field":
        return "{ c: " + t + " }"
    if cont == "mapval":
        return "{[string]: " + t + "}"
    if cont == "nested":
        return t + "[][]"
    raise AssertionError(cont)


def cont_lit(cont, inner):
    """The initializer expression for a container holding `inner` (an object literal)."""
    if cont == "bare":
        return inner
    if cont == "list":
        return "[" + inner + "]"
    if cont == "field":
        return "{ c: " + inner + " }"
    if cont == "nested":
        return "[[" + inner + "]]"
    raise AssertionError(cont)  # mapval is built by statements


def extract(cont, e):
    """An i32 expression reading the payload back out of a container expression."""
    if cont == "bare":
        return "(" + e + ").r"
    if cont == "list":
        return "(" + e + ")[0].r"
    if cont == "field":
        return "(" + e + ").c.r"
    if cont == "mapval":
        return "((" + e + ')["k"] ?? { r: 0 }).r'
    if cont == "nested":
        return "(" + e + ")[0][0].r"
    raise AssertionError(cont)


def zero_lit(cont):
    if cont == "mapval":
        return "Map()"
    return cont_lit(cont, "{ r: 0 }")


def build_local(cont, name, annty, n_expr):
    """Statements that bind `name` to the container holding { r: <n_expr> }."""
    a = ": " + annty if annty else ""
    if cont == "mapval":
        return [
            "  const " + name + a + " = Map()",
            "  " + name + '["k"] = { r: ' + n_expr + " }",
        ]
    return ["  const " + name + a + " = " + cont_lit(cont, "{ r: " + n_expr + " }")]


def skipped(decl, ann, twin, cont, cons, route, order):
    if ann == "otherarm" and decl != "arm":
        return "otherarm needs a union"
    if order == "after" and decl == "nodecl" and twin == "none":
        return "no declaration block to reorder"
    return None


def emit(decl, ann, twin, cont, cons, route, order):
    t = target_name(decl, ann)
    ct = cont_type(cont, t)
    localann = ct if ann in ("localann", "both", "otherarm") else ""
    retann = ct if ann in ("retann", "both") else ""

    block = base_decls(decl, ann)
    tw_block, tw_late = twin_decls(twin)
    block = block + tw_block

    helpers = []
    imports = []
    if route == "gen":
        helpers.append("function idg<T>(x: T): T { return x }")
    if route == "std":
        imports.append('import { mapIndexed } from "std:array"')

    params = "n: i32" if route != "std" else "n: i32, _i: i32"

    # ---- the producer function -------------------------------------------------
    body = build_local(cont, "c", localann, "n")
    ret_sig = ""
    globals_ = []
    tail_stmts = []

    if cons in ("ret", "bound", "pass"):
        ret_sig = ": " + retann if retann else ""
        if cons == "ret":
            val = "c"
        elif cons == "bound":
            body.append("  const o = c")
            val = "o"
        else:  # pass -- a callee whose PARAM is annotated and whose RESULT is not
            helpers.append("function thru(x: " + ct + ") { return x }")
            val = "thru(c)"
        if route == "gen":
            val = "idg(" + val + ")"
        body.append("  return " + val)
    else:
        # inline / store both hand back the i32, so the result annotation degenerates
        # to `: i32` -- kept as a declared control rather than dropped.
        ret_sig = ": i32" if retann else ""
        if cons == "inline":
            rd = extract(cont, "c")
            if route == "gen":
                rd = "idg(" + rd + ")"
            body.append("  print(" + rd + ")")
        else:  # store
            globals_.append("let gsto: " + ct + " = " + zero_lit(cont))
            src = "idg(c)" if route == "gen" else "c"
            body.append("  gsto = " + src)
        body.append("  return n")

    fn = ["function mk(" + params + ")" + ret_sig + " {"] + body + ["}"]

    # ---- the top-level driver --------------------------------------------------
    if route == "std":
        call = "mapIndexed([7], mk)[0]"
    else:
        call = "mk(7)"

    if cons in ("ret", "bound", "pass"):
        rd = extract(cont, call)
        if route == "gen":
            rd = "idg(" + rd + ")"
        tail_stmts.append("print(" + rd + ")")
    elif cons == "inline":
        tail_stmts.append(call if route != "std" else "mapIndexed([7], mk)")
    else:  # store
        tail_stmts.append(call if route != "std" else "mapIndexed([7], mk)")
        rd = extract(cont, "gsto")
        if route == "gen":
            rd = "idg(" + rd + ")"
        tail_stmts.append("print(" + rd + ")")

    # ---- assemble --------------------------------------------------------------
    out = []
    out += imports
    if order == "before":
        out += block
    out += globals_
    out += helpers
    out += fn
    if order == "after":
        out += block
    out += tw_late
    out += tail_stmts
    return "\n".join(out) + "\n"


def main():
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.endswith(".vl") or f.endswith(".expected"):
            os.remove(os.path.join(outdir, f))
    n = 0
    nskip = 0
    manifest = []
    for decl, ann, twin, cont, cons, route, order in itertools.product(
        DECLS, ANNS, TWINS, CONTS, CONSS, ROUTES, ORDERS
    ):
        why = skipped(decl, ann, twin, cont, cons, route, order)
        if why:
            nskip += 1
            continue
        name = "_".join([decl, ann, twin, cont, cons, route, order])
        src = emit(decl, ann, twin, cont, cons, route, order)
        with open(os.path.join(outdir, name + ".vl"), "w") as fh:
            fh.write(src)
        # THE EXPECTATION IS COMPUTED HERE, from the program this generator just wrote,
        # and never from the compiler: every cell stores 7 into { r: ... } and prints
        # exactly that field back.
        manifest.append(name + "\t7")
        n += 1
    with open(os.path.join(outdir, "manifest.tsv"), "w") as fh:
        fh.write("\n".join(manifest) + "\n")
    print("cells=%d skipped=%d" % (n, nskip))


if __name__ == "__main__":
    main()
