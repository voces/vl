#!/usr/bin/env python3
"""PRE-FLIGHT: rep x container in the CLEAN shape.

The clean shape is the census coordinate that carries NO nominal ambiguity —
twin=none, union=nounion, claim=0, declness=byname, annotation on the binding,
storage=local, scope=fn, delivery=direct, probe value=single, order=norm.
Anything that is not `runs` here is a LANGUAGE LIMIT or a harness spelling error,
not a silent defect, and the census must exclude it by NAME rather than inherit it.

Every cell prints exactly `7`.
"""
import json
import os
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# rep -> (field type spelling, canonical field value, default field value, predicate on X)
REPS = {
    "i32":    ("i32", "7", "0", "{X}.r == 7"),
    "i64":    ("i64", "7", "0", "{X}.r == 7"),
    "f64":    ("f64", "7.5", "0.5", "{X}.r > 7.0"),
    "f32":    ("f32", "7.5", "0.5", "{X}.r > 7.0"),
    "bool":   ("boolean", "true", "false", "{X}.r"),
    "str":    ("string", '"seven"', '""', '{X}.r == "seven"'),
    "strlit": ("K", '"p"', '"q"', '{X}.r == "p"'),
    "numlit": ("N", "1", "2", "{X}.r == 1"),
    "f64lit": ("F", "1.5", "2.5", "{X}.r == 1.5"),
    "list":   ("i32[]", "[1, 2]", "[]", "{X}.r.length == 2"),
    "map":    ("{[string]: i32}", "mkI()", "Map()", "{X}.r.size == 1"),
    "obj":    ("Inner", "{ q: 7 }", "{ q: 0 }", "{X}.r.q == 7"),
    "arm":    ("Shape2", "{ c2: 1 }", "{ s2: 1 }", "{X}.r is Cir2"),
    "nul":    ("i32 | null", "7", "null", "{X}.r != null"),
    # the payload is NOT an object at all -- the negative control that says the
    # nominal object shape is load-bearing.
    "@scalar": ("i32", "7", "0", "{X} == 7"),
    "@string": ("string", '"seven"', '""', '{X} == "seven"'),
}

PRELUDE = '''type K = "p" | "q"
type N = 1 | 2
type F = 1.5 | 2.5
type Inner = { q: i32 }
type Cir2 = { c2: i32 }
type Sq2 = { s2: i32 }
type Shape2 = Cir2 | Sq2
function mkI(): {[string]: i32} {
  const mi: {[string]: i32} = Map()
  mi["z"] = 1
  return mi
}
'''

CONTS = ["bare", "list", "listlist", "list3", "mapval", "nestedmap", "map3",
         "forin", "map_of_list", "list_of_map", "structfield", "structfield2"]


def payload_ty(rep):
    return "i32" if rep == "@scalar" else ("string" if rep == "@string" else "Circle")


def payload_decl(rep):
    if rep.startswith("@"):
        return []
    return ["type Circle = { r: %s }" % REPS[rep][0]]


def val(rep, canonical):
    ft, cv, dv, _ = REPS[rep]
    v = cv if canonical else dv
    if rep.startswith("@"):
        return v
    return "{ r: %s }" % v


def cont_ty(cont, p):
    return {
        "bare": p,
        "list": p + "[]",
        "listlist": p + "[][]",
        "list3": p + "[][][]",
        "mapval": "{[string]: %s}" % p,
        "nestedmap": "{[string]: {[string]: %s}}" % p,
        "map3": "{[string]: {[string]: {[string]: %s}}}" % p,
        "forin": p + "[]",
        "map_of_list": "{[string]: %s[]}" % p,
        "list_of_map": "{[string]: %s}[]" % p,
        "structfield": "WS",
        "structfield2": "WS2",
    }[cont]


def extra_decls(cont, p):
    if cont == "structfield":
        return ["type WS = { f: {[string]: %s} }" % p]
    if cont == "structfield2":
        return ["type WS = { f: {[string]: %s} }" % p, "type WS2 = { g: WS }"]
    return []


def build(cont, rep, indent="  "):
    """Statements building local `c` (annotated) holding ONE canonical payload."""
    p = payload_ty(rep)
    cty = cont_ty(cont, p)
    v = val(rep, True)
    L = []
    a = lambda s: L.append(indent + s)
    if cont == "bare":
        a("const c: %s = %s" % (cty, v))
    elif cont in ("list", "forin"):
        a("const c: %s = [%s]" % (cty, v))
    elif cont == "listlist":
        a("const c: %s = [[%s]]" % (cty, v))
    elif cont == "list3":
        a("const c: %s = [[[%s]]]" % (cty, v))
    elif cont == "mapval":
        a("const c: %s = Map()" % cty)
        a('c["k"] = %s' % v)
    elif cont == "nestedmap":
        a("const l1: {[string]: %s} = Map()" % p)
        a('l1["k"] = %s' % v)
        a("const c: %s = Map()" % cty)
        a('c["o"] = l1')
    elif cont == "map3":
        a("const l1: {[string]: %s} = Map()" % p)
        a('l1["k"] = %s' % v)
        a("const l2: {[string]: {[string]: %s}} = Map()" % p)
        a('l2["o"] = l1')
        a("const c: %s = Map()" % cty)
        a('c["p"] = l2')
    elif cont == "map_of_list":
        a("const c: %s = Map()" % cty)
        a('c["k"] = [%s]' % v)
    elif cont == "list_of_map":
        a("const l1: {[string]: %s} = Map()" % p)
        a('l1["k"] = %s' % v)
        a("const c: %s = [l1]" % cty)
    elif cont == "structfield":
        a("const l1: {[string]: %s} = Map()" % p)
        a('l1["k"] = %s' % v)
        a("const c: WS = { f: l1 }")
    elif cont == "structfield2":
        a("const l1: {[string]: %s} = Map()" % p)
        a('l1["k"] = %s' % v)
        a("const w1: WS = { f: l1 }")
        a("const c: WS2 = { g: w1 }")
    else:
        raise AssertionError(cont)
    return L


def read(cont, rep, expr, indent="  "):
    """Statements printing 7 when the canonical payload is reached, else 0."""
    d = val(rep, False)
    pred = REPS[rep][3]
    L = []
    a = lambda s: L.append(indent + s)
    if cont == "bare":
        a("if %s { print(7) } else { print(0) }" % pred.format(X="(%s)" % expr))
    elif cont == "list":
        a("const c0 = %s" % expr)
        a("if c0.length > 0 { if %s { print(7) } else { print(0) } } else { print(0) }"
          % pred.format(X="c0[0]"))
    elif cont == "listlist":
        a("const c0 = %s" % expr)
        a("if c0.length > 0 { if c0[0].length > 0 { if %s { print(7) } "
          "else { print(0) } } else { print(0) } } else { print(0) }"
          % pred.format(X="c0[0][0]"))
    elif cont == "list3":
        a("const c0 = %s" % expr)
        a("if c0.length > 0 { if c0[0].length > 0 { if c0[0][0].length > 0 { if %s { print(7) } "
          "else { print(0) } } else { print(0) } } else { print(0) } } else { print(0) }"
          % pred.format(X="c0[0][0][0]"))
    elif cont == "mapval":
        a('const g = (%s)["k"] ?? %s' % (expr, d))
        a("if %s { print(7) } else { print(0) }" % pred.format(X="g"))
    elif cont == "nestedmap":
        a('const g = (((%s)["o"] ?? Map())["k"]) ?? %s' % (expr, d))
        a("if %s { print(7) } else { print(0) }" % pred.format(X="g"))
    elif cont == "map3":
        a('const g = (((((%s)["p"] ?? Map())["o"] ?? Map())["k"])) ?? %s' % (expr, d))
        a("if %s { print(7) } else { print(0) }" % pred.format(X="g"))
    elif cont == "forin":
        a("let hit = 0")
        a("for zz in %s {" % expr)
        a("  if %s { hit = 7 }" % pred.format(X="zz"))
        a("}")
        a("print(hit)")
    elif cont == "map_of_list":
        a('const c0 = (%s)["k"] ?? []' % expr)
        a("if c0.length > 0 { if %s { print(7) } else { print(0) } } else { print(0) }"
          % pred.format(X="c0[0]"))
    elif cont == "list_of_map":
        a("const c0 = %s" % expr)
        a('if c0.length > 0 { const g = c0[0]["k"] ?? %s' % d)
        a("  if %s { print(7) } else { print(0) } } else { print(0) }"
          % pred.format(X="g"))
    elif cont == "structfield":
        a('const g = (%s).f["k"] ?? %s' % (expr, d))
        a("if %s { print(7) } else { print(0) }" % pred.format(X="g"))
    elif cont == "structfield2":
        a('const g = (%s).g.f["k"] ?? %s' % (expr, d))
        a("if %s { print(7) } else { print(0) }" % pred.format(X="g"))
    else:
        raise AssertionError(cont)
    return L


def main():
    n = 0
    expect = {}
    for rep in REPS:
        for cont in CONTS:
            p = payload_ty(rep)
            lines = [PRELUDE.rstrip()]
            lines += payload_decl(rep)
            lines += extra_decls(cont, p)
            lines.append("function rd() {")
            lines += build(cont, rep)
            lines += read(cont, rep, "c")
            lines.append("}")
            lines.append("rd()")
            name = "%s__%s" % (rep.replace("@", "at_"), cont)
            open(os.path.join(OUT, name + ".vl"), "w").write("\n".join(lines) + "\n")
            expect[name] = "7"
            n += 1
    json.dump({"expect": expect}, open(os.path.join(OUT, "manifest.json"), "w"))
    print("matrix cells:", n)


main()
