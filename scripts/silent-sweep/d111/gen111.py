#!/usr/bin/env python3
"""
The D111 / D117 grid.

Two rows closed together, so ONE population covers both and each half is the other's
negative control — a change that moves cells it has no business moving is visible without
a second run.

Every cell prints exactly one line and the EXPECTATION IS COMPUTED HERE, from the program
this generator just wrote, never from the compiler. A cell whose module loads and answers
wrong therefore grades `wrong_value` and not `runs` (`sweep52.py` is the shared grader —
using ONE grader across this family is what makes the residues comparable).

AXES

  D111 half (1 x 2 x 5 x 3 x 6 x 2 = 360 cells)
    decl    the declared CLAIMANTS for the layout `{r: i32}` — nodecl / plain (one) /
            plaintwin (two) / arm (the layout is a union ARM, so `collectS` skips its row) /
            armtwin / armdiff.  The twin-claimant axis: D100's axis is the SECOND claimant
            and D111's is the FIRST, so a grid holding `decl` fixed cannot tell them apart.
    ann     the annotation SPELLING — the bare inline shape, and the nullable one.
    store   the STORAGE CLASS the annotated binding lives in: local / param / global /
            field / return.
    route   plain / gen (a hand-written generic CONSUMES the binding) / std (`std:array`).
            `gen` is the coordinate where the guard fix alone goes BACKWARD.
    order   the declaration block before or after the code that uses it.

  D117 half (9 x 3 x 5 x 5 x 2 = 1,350 cells)
    elem    the element type across the rep vocabulary: the atom niche as a declared ALIAS,
            as an INLINE member set (which `canonEmitName` softens to `string`), boolean
            (the i32 sentinel 2), string (the ref niche), i32 / i64 / f64 / f32, and a
            declared struct.
    depth   1-D / 2-D / 3-D.  D117 is a NESTED-annotation row and every 1-D form already
            ran, so depth is the axis and 1-D is the control.
    value   THE PROBE VALUE, and this axis exists because D117 was found by one:
            allnull / mixed / empty / single / nestedempty.  The defect is invisible to
            every value but `allnull`, and ten cells of an earlier PR read as backward
            moves until a non-null value separated them.
    store   global / local / param / return / field.
    nul     `(T | null)[]…` vs the bare `T[]…` control — the bare rows are LOUD CHECK
            rejects by construction (a `null` in a non-nullable list), which is the
            grid's own assertion that the checker still refuses what it should.
"""
import itertools
import os
import sys

# ── D111 half ────────────────────────────────────────────────────────────────
DECLS = {
    "nodecl": [],
    "plain": ["type Circle = { r: i32 }"],
    "plaintwin": ["type Circle = { r: i32 }", "type Dot = { r: i32 }"],
    "arm": ["type Circle = { r: i32 }", "type Sq = { s: i32 }",
            "type Shape = Circle | Sq"],
    "armtwin": ["type Circle = { r: i32 }", "type Sq = { s: i32 }",
                "type Shape = Circle | Sq", "type Dot = { r: i32 }"],
    "armdiff": ["type Cc = { q: i32 }", "type Sq = { s: i32 }",
                "type Shape = Cc | Sq", "type Dot = { r: i32 }"],
}
ANNS = {"ann1": "{ r: i32 }", "ann2": "{ r: i32 } | null"}
STORES = ["local", "param", "global", "field", "ret"]
ROUTES = ["plain", "gen", "std"]
ORDERS = ["before", "after"]


def d111(decl, ann, store, route, order):
    a = ANNS[ann]
    nul = ann == "ann2"
    imp = ['import { reverse } from "std:array"'] if route == "std" else []
    helpers = ["function idg<T>(x: T): T { return x }"] if route == "gen" else []
    use = "idg(c)" if route == "gen" else "c"
    # The read is `.r` on a non-null value; a nullable one coalesces first, so the
    # printed value is 7 either way and the NULLABILITY rides the pin rather than the
    # expectation.
    def rd(e):
        return f"({e} ?? {{ r: 0 }}).r" if nul else f"{e}.r"

    if store == "local":
        body = [f"function mk(n: i32) {{",
                f"  const c: {a} = {{ r: n }}",
                f"  return {use}", "}"]
        val = rd("mk(7)")
    elif store == "param":
        body = [f"function mk(c: {a}) {{", f"  return {use}", "}"]
        val = rd("mk({ r: 7 })")
    elif store == "global":
        body = [f"const c: {a} = {{ r: 7 }}"]
        val = rd(use)
    elif store == "field":
        body = [f"type Holder = {{ h: {a} }}",
                "function mk(n: i32) {",
                "  const o: Holder = { h: { r: n } }",
                "  const c = o.h", f"  return {use}", "}"]
        val = rd("mk(7)")
    else:  # ret
        body = [f"function mk(n: i32): {a} {{",
                "  const c = { r: n }", f"  return {use}", "}"]
        val = rd("mk(7)")

    if route == "std":
        # A `std:array` generic over a LIST of the same shape, so the annotation reaches
        # the monomorphizer through an IMPORT rather than a local declaration. Folded into
        # the SAME print so the cell still emits exactly one line: `reverse` of a 1-element
        # list has length 1, so the term is 0 and a wrong answer moves the printed 7.
        body = body + [f"const xs: ({a})[] = [{{ r: 1 }}]"]
        val = f"{val} + reverse(xs).length - 1"
    tail = [f"print({val})"]
    block = ["\n".join(DECLS[decl])] if DECLS[decl] else []
    if order == "before":
        out = imp + block + helpers + body + tail
    else:
        out = imp + helpers + body + tail + block
    return "\n".join(x for x in out if x) + "\n", "7"


# ── D117 half ────────────────────────────────────────────────────────────────
# (prelude, element spelling, a non-null member literal, an equality the member satisfies)
ELEMS = {
    "Kalias": ('type K = "a" | "b"', "K", '"a"', '== "a"'),
    "Kinline": ("", '("a" | "b")', '"a"', '== "a"'),
    "bool": ("", "boolean", "true", "== true"),
    "string": ("", "string", '"z"', '== "z"'),
    "i32": ("", "i32", "5", "== 5"),
    "i64": ("", "i64", "5", "== 5"),
    "f64": ("", "f64", "1.5", "== 1.5"),
    "f32": ("", "f32", "1.5", "== 1.5"),
    "struct": ("type S = { r: i32 }", "S", "{ r: 3 }", "!= null"),
}
DEPTHS = ["d1", "d2", "d3"]
VALUES = ["allnull", "mixed", "empty", "single", "nestedempty"]
D117_STORES = ["global", "local", "param", "ret", "field"]
NULS = ["nul", "bare"]


def d117_lit(depth, value, member):
    """The literal, and the index path + expectation the cell prints."""
    n = {"d1": 1, "d2": 2, "d3": 3}[depth]
    if value == "empty":
        return "[]", "c.length", "0"
    if value == "nestedempty":
        if n == 1:
            return "[]", "c.length", "0"
        lit = "[" * n + "]" * n            # [[]] / [[[]]]
        return lit, "c.length", "1"
    idx = "".join("[0]" for _ in range(n))
    if value == "allnull":
        lit = "[" * n + "null" + "]" * n
        return lit, f"c{idx} == null", "true"
    if value == "single":
        lit = "[" * n + member + "]" * n
        return lit, f"c{idx} == null", "false"
    # mixed: the member FIRST and a null second, at the innermost level
    lit = "[" * n + member + ", null" + "]" * n
    idx1 = "".join("[0]" for _ in range(n - 1)) + "[1]"
    return lit, f"c{idx1} == null", "true"


def d117(elem, depth, value, store, nul):
    pre, ty, member, _eq = ELEMS[elem]
    base = f"({ty} | null)" if nul == "nul" else ty
    ann = base + {"d1": "[]", "d2": "[][]", "d3": "[][][]"}[depth]
    lit, expr, expect = d117_lit(depth, value, member)
    if store == "global":
        body = [f"const c: {ann} = {lit}", f"print({expr})"]
    elif store == "local":
        body = ["function f() {", f"  const c: {ann} = {lit}",
                f"  return {expr}", "}", "print(f())"]
    elif store == "param":
        body = [f"function f(c: {ann}) {{ return {expr} }}", f"print(f({lit}))"]
    elif store == "ret":
        body = [f"function f(): {ann} {{ return {lit} }}",
                f"const c = f()", f"print({expr})"]
    else:  # field
        body = [f"type B = {{ g: {ann} }}", f"const b: B = {{ g: {lit} }}",
                f"const c = b.g", f"print({expr})"]
    out = ([pre] if pre else []) + body
    return "\n".join(out) + "\n", expect


def main():
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.endswith(".vl") or f == "manifest.tsv":
            os.remove(os.path.join(outdir, f))
    manifest = []
    for decl, ann, store, route, order in itertools.product(
        DECLS, ANNS, STORES, ROUTES, ORDERS
    ):
        name = "_".join(["d111", decl, ann, store, route, order])
        src, expect = d111(decl, ann, store, route, order)
        with open(os.path.join(outdir, name + ".vl"), "w") as fh:
            fh.write(src)
        manifest.append(name + "\t" + expect)
    for elem, depth, value, store, nul in itertools.product(
        ELEMS, DEPTHS, VALUES, D117_STORES, NULS
    ):
        name = "_".join(["d117", elem, depth, value, store, nul])
        src, expect = d117(elem, depth, value, store, nul)
        with open(os.path.join(outdir, name + ".vl"), "w") as fh:
            fh.write(src)
        manifest.append(name + "\t" + expect)
    with open(os.path.join(outdir, "manifest.tsv"), "w") as fh:
        fh.write("\n".join(sorted(manifest)) + "\n")
    print("cells=%d  (d111=%d  d117=%d)" % (
        len(manifest),
        len(DECLS) * len(ANNS) * len(STORES) * len(ROUTES) * len(ORDERS),
        len(ELEMS) * len(DEPTHS) * len(VALUES) * len(D117_STORES) * len(NULS)))


if __name__ == "__main__":
    main()
