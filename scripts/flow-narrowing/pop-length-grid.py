#!/usr/bin/env python3
"""The `.length` guard grid for `.pop()` (SP-008, D3558): element kind x place x form x reader.

Each cell guards a list place with a `.length` test and then pops it, after one of the forms
below. The oracle is the BEFORE seed running the same cell with a `??` reader, which every seed
accepts: if any input there prints the null marker, a null reaches the pop and the cell is
UNSAFE. A strict reader on the AFTER seed must then be refused; on a SAFE cell it must print the
oracle's output or be refused (`miss`). A `??` reader must run everywhere and print the oracle.

usage: pop-length-grid.py <before.wasm> <after.wasm> <outdir> [--filter substr]   (JOBS=8)
"""
import itertools, json, os, subprocess, sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

W = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = W + "/scripts/vl-host/target/release/vl"
before = os.path.abspath(sys.argv[1])
after = os.path.abspath(sys.argv[2])
out = os.path.abspath(sys.argv[3])
flt = sys.argv[5] if len(sys.argv) > 5 and sys.argv[4] == "--filter" else ""
os.makedirs(out, exist_ok=True)

# kind: (element type, the element built from an i32 `v`, a strict i32 use of value `e`, the
# `??` default, which every use maps to the null marker -777)
KINDS = {
    "i32": ("i32", "v", lambda e: e + " + 0", "-777"),
    "f64": ("f64", "(v as f64) + 0.5", lambda e: "(" + e + " * 2.0) as! i32", "-388.5"),
    "rec": ("S", "{ n: v }", lambda e: e + ".n", "{ n: -777 }"),
    "str": ("string", '"s" + toString(v)', lambda e: "lenOr(" + e + ")", '"-777"'),
    "nest": ("i32[]", "[v]", lambda e: e + "[0]", "[-777]"),
    "uni": ("A | B", "{ a: v }", lambda e: "rd(" + e + ")", "{ b: -777 }"),
    "i64": ("i64", "v as i64", lambda e: "(" + e + " + 0) as! i32", "-777"),
    "u8": ("u8", "v", lambda e: e + " + 0", "-777"),
    "lit": ('"p" | "q"', 'if v % 2 == 0 { "p" } else { "q" }', lambda e: "lu(" + e + ")", None),
    # no `??` default can stand for null here, so the lenient reader takes `boolean | null`
    "bool": ("boolean", "v % 2 == 0", lambda e: "bi(" + e + ")", None),
}
PLACES = ["local", "param", "global", "field"]
# form: statements between the guard and the pop (`@E` an element), or an `@` shape below.
FORMS = {
    "plain": "", "while": "", "ne": "", "ge1": "", "swap": "",
    "two": "X.pop()",
    "twowhile": "X.pop()",
    "push": "X.push(@E)",
    "pushloop": "let j = 0\nwhile j < k { X.push(@E); j = j + 1 }",
    "loopbefore": "let j = 0\nwhile j < k { j = j + 1 }",
    "alias": "const ys = X\nys.pop()",
    "closure": "const f = () => { X.pop() }\nf()",
    "call": "drain(X)",
    "noop": "noop()",
    "reassign": "X = []",
    "inloop": "@LOOP", "shadow": "@SHADOW", "elsearm": "@ELSE", "after": "@AFTER",
    "lambda": "@LAMBDA", "nested": "@NESTED", "named": "@NAMED", "condpop": "@CONDPOP",
    # field place only: a write to the same record through a second name (the #3356 review)
    "aliaswrite": "const p = o\nif c { p.xs = [] }",
    "aliasparam": "@ALIASPARAM",
}
READS = ["strict", "coal"]
INPUTS = [(n, k, c) for n in (0, 1, 2) for k in (0, 2) for c in (True, False)]


def gen(kind, place, form, read):
    T, elfn, use, dflt = KINDS[kind]
    LT = ("(" + T + ")" if "|" in T else T) + "[]"
    X = {"local": "xs", "param": "xs", "global": "g", "field": "o.xs"}[place]
    if place == "param" and form == "reassign":
        return None
    if place == "field" and form == "shadow":
        return None
    if place != "field" and form in ("aliaswrite", "aliasparam"):
        return None
    src = ['import { toString } from "std:fmt"',
           "type S = { n: i32 }", "type A = { a: i32 }", "type B = { b: i32 }",
           "type O = { xs: " + LT + " }",
           "function rd(v: A | B): i32 { if v is A { return v.a } return v.b }",
           "function noop(): i32 { return 0 }",
           'function lu(v: string): i32 { if v == "z" { return -777 } if v == "p" { return 1 } return 2 }',
           "function nb(b: boolean | null): i32 { if b == null { return -777 } if b { return 1 } return 0 }",
           "function bi(b: boolean): i32 { if b { return 1 } return 0 }",
           'function nl(v: "p" | "q" | null): i32 { if v == null { return -777 } return lu(v) }',
           'function lenOr(s: string): i32 { if s == "-777" { return -777 } return s.length }',
           "function EL(v: i32): " + ("i32" if T == "u8" else T) + " { " + elfn + " }",
           "function drain(l: " + LT + ") { l.pop() }",
           "function two(a: i32, b: i32): i32 { return a * 1000 + b }",
           "function mk(n: i32): " + LT + " {",
           "  const r: " + LT + " = []",
           "  let i = 0",
           "  while i < n { r.push(EL(i + 1)); i = i + 1 }",
           "  return r", "}"]
    if place == "field":
        src.append("function drainN(o: O): i32 {\n  o.xs.pop()\n  return 0\n}")
    else:
        src.append("function drainN(l: " + LT + "): i32 {\n  l.pop()\n  return 0\n}")
    if place == "global":
        src.append("let g: " + LT + " = []")
    val = "X.pop()" if read == "strict" else "(X.pop() ?? " + str(dflt) + ")"
    cv = use(val)
    rd = "print(" + cv + ")"
    if dflt is None and read != "strict":
        val = "X.pop()"
        cv = ("nl" if kind == "lit" else "nb") + "(X.pop())"
        rd = "print(" + cv + ")"
    cond = {"ne": "X.length != 0", "ge1": "X.length >= 1", "swap": "0 < X.length"}.get(form, "X.length > 0")
    head = ("while " if form in ("while", "twowhile") else "if ") + cond + " {"
    pre = FORMS[form]
    body = []
    if place == "local":
        body.append("let xs = mk(n)")
    elif place == "global":
        body.append("g = mk(n)")
    elif place == "field":
        body.append("const o: O = { xs: mk(n) }")
    if pre == "@LOOP":
        body += [head, "  let j = 0", "  while j < k { " + rd + "; j = j + 1 }", "}"]
    elif pre == "@SHADOW":
        body += [head, "  {", "    let X: " + LT + " = []", "    " + rd, "  }", "}"]
    elif pre == "@ELSE":
        body += [head, "  print(1)", "} else {", "  " + rd, "}"]
    elif pre == "@AFTER":
        body += [head, "  print(1)", "}", rd]
    elif pre == "@LAMBDA":
        body += [head, "  const f = (): i32 => {", "    " + rd, "    return 0", "  }",
                 "  if c { X.pop() }", "  f()", "}"]
    elif pre == "@NESTED":
        body += [head, "  if c { X.pop() }", "  " + rd, "}"]
    elif pre == "@NAMED":
        body += [head, "  print(two(b: " + cv + ", a: drainN(" + ("o" if place == "field" else X) + ")))", "}"]
    elif pre == "@CONDPOP":
        body += [head, "  if c { " + rd + " } else { " + rd + " }", "}"]
    elif pre == "@ALIASPARAM":
        src.append("function h(a: O, b: O, c: boolean) {")
        src.append("  " + head.replace("X", "a.xs"))
        src.append("    if c { b.xs = [] }")
        src.append("    " + rd.replace("X", "a.xs"))
        src.append("  }")
        src.append("}")
        body.append("h(o, o, c)")
    else:
        body.append(head)
        for l in pre.split("\n"):
            if l.strip():
                body.append("  " + l.strip().replace("@E", "EL(9)"))
        body.append("  " + rd)
        body.append("}")
    body = [l.replace("X", X) for l in body]
    params = "n: i32, k: i32, c: boolean"
    if place == "param":
        params += ", xs: " + LT
    src.append("function f(" + params + ") {")
    src += ["  " + l for l in body]
    src.append("}")
    for (n, k, c) in INPUTS:
        args = str(n) + ", " + str(k) + ", " + ("true" if c else "false")
        if place == "param":
            args += ", mk(" + str(n) + ")"
        src.append("f(" + args + ")")
        src.append('print("--")')
    return "\n".join(src) + "\n"


def run1(seed, fp):
    env = dict(os.environ, VL_STD=W + "/std")
    try:
        p = subprocess.run(["timeout", "60", VL, "run", fp, "--compiler", seed],
                           capture_output=True, text=True, env=env, cwd=W)
        return p.returncode, p.stdout, p.stderr
    except Exception as e:
        return -99, "", str(e)


def classify(rc, so, se):
    low = se.lower()
    if rc != 0 and so == "" and "error" in low and "trap" not in low and "valid" not in low \
            and "bug in vl" not in low:
        return "refused"
    if rc != 0:
        return "trap"
    return "runs"


def job(args):
    name, kind, place, form = args
    res = {"name": name}
    fps = {}
    for r in READS:
        fps[r] = os.path.join(out, name + "_" + r + ".vl")
        open(fps[r], "w").write(gen(kind, place, form, r))
    orc, oso, ose = run1(before, fps["coal"])
    if orc != 0:
        res["grade"] = "NOORACLE"
        res["stderr"] = ose[-300:]
        return res
    unsafe = "-777" in oso
    res["safe"] = not unsafe
    grades = []
    for r in READS:
        rc, so, se = run1(after, fps[r])
        o = classify(rc, so, se)
        if r == "coal":
            g = "ok" if o == "runs" and so == oso else "COAL-" + o.upper()
        elif unsafe:
            g = "ok" if o == "refused" else "UNSOUND"
        elif o == "runs":
            g = "ok" if so == oso else "WRONG"
        else:
            g = "miss" if o == "refused" else "TRAP"
        grades.append(g)
        res[r] = {"outcome": o, "grade": g, "stderr": se[-300:]}
    bad = [g for g in grades if g not in ("ok", "miss")]
    res["grade"] = bad[0] if bad else ("miss" if "miss" in grades else "ok")
    return res


jobs = []
for kind, place, form in itertools.product(KINDS, PLACES, FORMS):
    name = "_".join([kind, place, form])
    if flt and not any(f in name for f in flt.split(",")):
        continue
    if gen(kind, place, form, "coal") is None:
        continue
    jobs.append((name, kind, place, form))
with ThreadPoolExecutor(int(os.environ.get("JOBS", "8"))) as ex:
    results = list(ex.map(job, jobs))
with open(os.path.join(out, "results.jsonl"), "w") as fh:
    for r in results:
        fh.write(json.dumps(r) + "\n")
print(len(results), Counter(r["grade"] for r in results))
