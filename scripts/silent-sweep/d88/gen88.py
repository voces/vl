#!/usr/bin/env python3
"""D88/D100 shared ablation grid.

Axes (brief): route x container x claimant-count/arm-ness (decl) x shape source
x annotation x delivery x declaration order.
"""
import os, sys, itertools

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

DECLS = {
    # name: (normal-order decl lines, reversed-order decl lines or None)
    "nodecl":   ([], None),
    "plain":    (["type Circle = { r: i32 }"], None),
    "plaintwin":(["type Circle = { r: i32 }", "type Dot = { r: i32 }"],
                 ["type Dot = { r: i32 }", "type Circle = { r: i32 }"]),
    "arm":      (["type Circle = { r: i32 }", "type Sq = { s: i32 }",
                  "type Shape = Circle | Sq"],
                 ["type Sq = { s: i32 }", "type Circle = { r: i32 }",
                  "type Shape = Circle | Sq"]),
    "armtwin":  (["type Circle = { r: i32 }", "type Sq = { s: i32 }",
                  "type Shape = Circle | Sq", "type Dot = { r: i32 }"],
                 ["type Dot = { r: i32 }", "type Circle = { r: i32 }",
                  "type Sq = { s: i32 }", "type Shape = Circle | Sq"]),
    "armdiff":  (["type Circle = { r: i32 }", "type Sq = { s: i32 }",
                  "type Shape = Circle | Sq", "type Dot = { q: i32 }"],
                 ["type Dot = { q: i32 }", "type Circle = { r: i32 }",
                  "type Sq = { s: i32 }", "type Shape = Circle | Sq"]),
}

SRC = {"inline": "{ r: i32 }", "declname": "Circle"}

def cont_spell(cont, sh):
    if cont == "bare":        return sh
    if cont == "mapval":      return "{[string]: " + sh + "}"
    if cont == "nestedmap":   return "{[string]: {[string]: " + sh + "}}"
    if cont == "listelem":    return sh + "[]"
    if cont == "structfield": return "{ f: " + sh + " }"
    raise AssertionError(cont)

def build(cont, ann_ty):
    """statements building local `c`, plus the annotation applied to `c`."""
    a = (": " + ann_ty) if ann_ty else ""
    if cont == "bare":
        return ["  const c" + a + " = { r: n }"]
    if cont == "mapval":
        return ["  const c" + a + " = Map()", '  c["k"] = { r: n }']
    if cont == "nestedmap":
        inner = "  const i0 = Map()"
        return [inner, '  i0["k"] = { r: n }', "  const c" + a + " = Map()",
                '  c["o"] = i0']
    if cont == "listelem":
        return ["  const c" + a + " = [{ r: n }]"]
    if cont == "structfield":
        return ["  const c" + a + " = { f: { r: n } }"]
    raise AssertionError(cont)

def read(cont, e):
    if cont == "bare":        return "(" + e + ").r"
    if cont == "mapval":      return "((" + e + ')["k"] ?? { r: 0 }).r'
    if cont == "nestedmap":   return "(((" + e + ')["o"] ?? Map())["k"] ?? { r: 0 }).r'
    if cont == "listelem":    return "(" + e + ")[0].r"
    if cont == "structfield": return "(" + e + ").f.r"
    raise AssertionError(cont)

cells = {}
for decl, src, cont, route, deliv, ann, order in itertools.product(
        DECLS, SRC, ["bare", "mapval", "nestedmap", "listelem", "structfield"],
        ["none", "gen", "std"], ["direct", "local", "param", "paramlocal", "retann"],
        [0, 1], ["norm", "rev"]):
    dnorm, drev = DECLS[decl]
    if order == "rev":
        if drev is None: continue
        dlines = drev
    else:
        dlines = dnorm
    if src == "declname" and decl == "nodecl": continue

    sh = SRC[src]
    cty = cont_spell(cont, sh)

    head = list(dlines)
    if route == "gen":
        head.append("function idg<T>(x: T): T { return x }")
    elif route == "std":
        head.insert(0, 'import { reverse } from "std:array"')
    if deliv == "param":
        head.append("function thru(x: " + cty + ") { return x }")
    elif deliv == "paramlocal":
        head.append("function thru(x: " + cty + ") {\n  const y = x\n  return y\n}")

    body = build(cont, cty if ann else None)
    inner = "c"
    if deliv == "local":
        body.append("  const d = c")
        inner = "d"
    elif deliv == "param" or deliv == "paramlocal":
        inner = "thru(c)"

    if route == "gen":
        expr = "idg(" + inner + ")"
    elif route == "std":
        expr = "reverse([" + inner + "])[0]"
    else:
        expr = inner
    body.append("  return " + expr)

    retann = (": " + cty) if deliv == "retann" else ""
    prog = "\n".join(head + [""] if head else [])
    prog += "function mk(n: i32)" + retann + " {\n" + "\n".join(body) + "\n}\n"
    prog += "print(" + read(cont, "mk(7)") + ")\n"

    name = "_".join([decl, src, cont, route, deliv, "ann" + str(ann), order])
    cells[name] = prog

for k, v in cells.items():
    open(os.path.join(OUT, k + ".vl"), "w").write(v)
print("cells:", len(cells))
