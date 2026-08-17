#!/usr/bin/env python3
"""
Grader sabotage: inject programs whose outcome is KNOWN by construction and assert the
grader routes each to the right silent column.  A zero in a silent column is only
trustworthy once that column has been made to fire on demand.

PREDICTED (stated before the run):
  12 wrong_value      -- program prints a value the manifest does not expect
   8 wrong_evalcount  -- callee runs TWICE, value lines still correct, count line wrong
   6 trap             -- list index out of bounds at runtime
   4 correct          -- clean controls, must NOT move
  30 total
"""
import json, os, sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
cells = {}
n = 0


def add(text, expected, tag):
    global n
    name = f"s{n:05d}"
    open(os.path.join(OUT, name + ".vl"), "w").write(text)
    cells[name] = dict(leg="SAB", rep=tag, nul=0, pos="sab", con=tag, read="sab",
                       inp=0, expected=expected)
    n += 1


# ---- 12 cells that print a DIFFERENT value than the manifest claims (wrong_value)
WRONG = [
    ("i32", "print(1)", ["999"]),
    ("i64", "print(70)", ["71"]),
    ("f64", "print(1.25)", ["1.26"]),
    ("f32", "print(2.25)", ["2.5"]),
    ("boolean", "print(true)", ["false"]),
    ("string", 'print("aa")', ["bb"]),
    ("namedlit", 'type K = "p" | "q"\nconst k: K = "p"\nprint(k)', ["q"]),
    ("struct", "type S = { w: i32 }\nconst s: S = { w: 5 }\nprint(s.w)", ["6"]),
    ("list", "const xs: i32[] = [1, 2]\nprint(xs.length)", ["3"]),
    ("map", 'const m: {[string]: i32} = Map()\nm["k"] = 1\nprint(m.size)', ["2"]),
    ("closure", "const f: (i32) => i32 = (x) => x + 1\nprint(f(3))", ["5"]),
    ("nulstr", 'function b(p: string | null) { if p != null { print(p) } else { print("NUL") } }\nb("aa")',
     ["NUL"]),
]
for tag, body, exp in WRONG:
    add(body + "\nprint(1)\n", exp + ["1"], "sab_wrongvalue")

# ---- 8 cells whose callee runs TWICE while the value lines stay correct (wrong_evalcount)
DOUBLE = [
    ("i32", "i32", "7", "print(v0 + v1 - 7)", ["7"]),
    ("i64", "i64", "70", "print(v0 + v1 - 70)", ["70"]),
    ("string", "string", '"aa"', "print(v0)", ["aa"]),
    ("boolean", "boolean", "true", "print(v0 && v1)", ["true"]),
    ("f64", "f64", "1.25", "print(v0)", ["1.25"]),
    ("namedlit_", "K", '"p"', "print(v0)", ["p"]),
    ("nulstr", "string | null", '"aa"',
     'if v0 != null { print(v0) } else { print("NUL") }', ["aa"]),
    ("struct_", "S", "{ w: 5 }", "print(v0.w)", ["5"]),
]
for tag, ty, val, rd, exp in DOUBLE:
    decls = ""
    if ty == "K":
        decls = 'type K = "p" | "q"\n'
    if ty == "S":
        decls = "type S = { w: i32 }\n"
    text = (decls +
            "let nCalls = 0\n"
            f"function src(): {ty} {{ nCalls = nCalls + 1\n  return {val} }}\n"
            "function reader() {\n"
            f"  const v0: {ty} = src()\n"
            f"  const v1: {ty} = src()\n"
            f"  {rd}\n"
            "}\n"
            "reader()\n"
            "print(nCalls)\n")
    # the manifest claims ONE call; the program makes two.
    add(text, exp + ["1"], "sab_evalcount")

# ---- 6 cells that TRAP at runtime (list index out of bounds)
TRAPS = [
    ("i32[]", "[1, 2]", "print(xs[9])", ["1"]),
    ("string[]", '["a"]', "print(xs[9])", ["a"]),
    ("f64[]", "[1.25]", "print(xs[9])", ["1.25"]),
    ("i64[]", "[10]", "print(xs[9])", ["10"]),
    ("f32[]", "[1.25]", "print(xs[9])", ["1.25"]),
    ("S[]", "[{ w: 1 }]", "print(xs[9].w)", ["1"]),
]
for ty, val, rd, exp in TRAPS:
    decls = "type S = { w: i32 }\n" if ty == "S[]" else ""
    add(decls + f"const xs: {ty} = {val}\n{rd}\nprint(1)\n", exp + ["1"], "sab_trap")

# ---- 4 clean controls that must stay `correct`
add("print(7)\nprint(1)\n", ["7", "1"], "sab_control")
add('print("aa")\nprint(1)\n', ["aa", "1"], "sab_control")
add("const xs: i32[] = [1, 2]\nprint(xs.length)\nprint(1)\n", ["2", "1"], "sab_control")
add("type S = { w: i32 }\nconst s: S = { w: 5 }\nprint(s.w)\nprint(1)\n",
    ["5", "1"], "sab_control")

json.dump(dict(cells=cells, skipped=[]), open(os.path.join(OUT, "manifest.json"), "w"))
print(f"generated {n} sabotage cells")
