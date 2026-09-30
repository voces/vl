#!/usr/bin/env python3
"""The `if` join grid of flow narrowing's slice 1 (D3285; DECISIONS.md, "Flow narrowing:
per-path facts meet at joins"): place x condition x then action x else action x use x spelling.

Every cell runs its function over all eight inputs, and a Python oracle walks the same paths.
A SAFE cell (no path reaches the use with `null`) must run and print the oracle's output, or be
refused (`miss`, a precision gap). An UNSAFE cell must be refused: accepting it is `UNSOUND`.

usage: join-grid.py <seed.wasm> <outdir> [--filter substr]    (JOBS=8 by default)
       join-compare.py <outdir-before> <outdir-after>          transitions and runs lost
"""
import itertools, json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

W = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = W + "/scripts/vl-host/target/release/vl"
seed = os.path.abspath(sys.argv[1])
out = os.path.abspath(sys.argv[2])
flt = sys.argv[4] if len(sys.argv) > 4 and sys.argv[3] == "--filter" else ""
os.makedirs(out, exist_ok=True)

PLACES = ["name", "field", "elem", "global", "capname", "capparam"]
CONDS = ["c", "eq", "ne", "isnull"]
THENS = ["A", "N", "0"]
ELSES = ["-", "A", "N", "0"]
USES = ["arith", "pass", "coal", "member"]
SPELL = ["direct", "generic", "hole"]
# A second binding of the place's root, declared after the `if` in a nested block, a loop body or a
# lambda parameter: the join must not reach it. Its reads add into `sh`, printed last, which must
# stay 0 (the inner binding is always null).
SHADOWS = ["none", "block", "loop", "lambda"]

INPUTS = [(c, i, n) for c in (True, False) for i in (None, 3) for n in (None, 4)]


def oracle(cond, th, el, use, c, init, nv, sp="direct"):
    x = init
    if cond == "c":
        t = c
    elif cond == "eq" or cond == "isnull":
        t = x is None
    else:
        t = x is not None
    act = th if t else el
    if act == "A":
        x = 5
    elif act == "N":
        x = nv
    if use == "coal":
        return 7 if x is None else (x + 0 if True else 0)
    if x is None:
        return None
    if use == "arith" or use == "member":
        return x + 1
    if use == "pass":
        return x if sp == "generic" else x * 2
    raise Exception(use)


def gen(place, cond, th, el, use, sp, shadow="none"):
    obj = use == "member"
    if sp == "generic" and use in ("arith", "member"):
        return None
    if sp == "generic" and place in ("global", "capname", "capparam"):
        return None
    if obj and sp == "generic":
        return None
    V = "O" if obj else "i32"
    TV = "T" if sp == "generic" else V
    P = {"name": "x", "field": "b.v", "elem": "xs[0]", "global": "g", "capname": "x", "capparam": "init"}[place]
    condS = {"c": "c", "eq": P + " == null", "ne": P + " != null", "isnull": P + " is null"}[cond]
    aS = "a"
    def act(a):
        if a == "A":
            return P + " = " + aS
        if a == "N":
            return P + " = nv"
        return ""
    body = []
    if place == "name":
        if sp == "hole":
            body.append("  let x = init")
        else:
            body.append("  let x: " + TV + " | null = init")
    if place == "global":
        body.append("  g = init")
    if place == "capname":
        if sp == "hole":
            body.append("  let x = init")
        else:
            body.append("  let x: " + TV + " | null = init")
        body.append("  const clr = () => { x = null }")
    if place == "capparam":
        body.append("  const clr = () => { init = null }")
    ifs = "  if " + condS + " { " + act(th) + " }"
    if el != "-":
        ifs += " else { " + act(el) + " }"
    body.append(ifs)
    if use == "arith":
        u = P + " + 1"
    elif use == "member":
        u = P + ".n + 1"
    elif use == "pass":
        u = ("needT(" + P + ")") if sp == "generic" else ("need(" + P + ")")
    else:
        if obj:
            u = "(" + P + " ?? mk(7)).n"
        elif sp == "generic":
            u = P + " ?? d"
        else:
            u = P + " ?? 7"
    if shadow != "none":
        root = "b" if place == "field" else "x"
        inner = "b.v" if place == "field" else "x"
        if place == "field":
            decl = "const b: { v: " + V + " | null } = { v: null }"
        else:
            decl = "let x: " + V + " | null = null"
        rd = "if " + inner + " != null { sh = sh + 1 }"
        if shadow == "block":
            body.append("  { " + decl + "; " + rd + " }")
        elif shadow == "loop":
            body.append("  let si = 0")
            body.append("  while si < 1 { " + decl + "; " + rd + "; si = si + 1 }")
        else:
            if place == "field":
                body.append("  const q = (b: { v: " + V + " | null }): i32 => { if b.v != null { return 1 } return 0 }")
                body.append("  sh = sh + q({ v: null })")
            else:
                body.append("  const q = (x: " + V + " | null): i32 => { if x != null { return 1 } return 0 }")
                body.append("  sh = sh + q(null)")
    body.append("  return " + u)
    # signature
    ptype = {"name": "init", "field": "b", "elem": "xs", "global": "init", "capname": "init", "capparam": "init"}[place]
    if sp == "hole":
        params = "c, " + ptype + ", a, nv" + (", d" if False else "")
        ret = ""
    else:
        pt = {"name": TV + " | null", "field": "{ v: " + TV + " | null }",
              "elem": "(" + TV + " | null)[]", "global": TV + " | null",
              "capname": TV + " | null", "capparam": TV + " | null"}[place]
        params = "c: boolean, " + ptype + ": " + pt + ", a: " + TV + ", nv: " + TV + " | null"
        if sp == "generic":
            params += ", d: T"
        ret = ": i32" if sp == "direct" and not (use == "pass" and False) else ""
        if sp == "generic":
            ret = ": T"
    gen_ = "<T>" if sp == "generic" else ""
    src = []
    src.append("type O = { n: i32 }")
    src.append("function mk(n: i32): O { return { n: n } }")
    src.append("function need(v: " + ("O" if obj else "i32") + "): i32 { return " + ("v.n * 2" if obj else "v * 2") + " }")
    src.append("function needT<T>(v: T): T { return v }")
    src.append("function nn(v: i32): i32 | null { if v < 0 { return null } return v }")
    src.append("function no(v: i32): O | null { if v < 0 { return null } return mk(v) }")
    if place == "global":
        src.append("let g: " + V + " | null = null")
    if shadow != "none":
        src.append("let sh = 0")
    src.append("function f" + gen_ + "(" + params + ")" + ret + " {")
    src += body
    src.append("}")
    # main
    def val(v):
        if obj:
            return "no(" + ("-1" if v is None else str(v)) + ")"
        return "nn(" + ("-1" if v is None else str(v)) + ")"
    aval = "mk(5)" if obj else "5"
    for (c, i, n) in INPUTS:
        cs = "true" if c else "false"
        if place == "field":
            arg = "{ v: " + val(i) + " }"
        elif place == "elem":
            arg = "[" + val(i) + "]"
        else:
            arg = val(i)
        extra = ", 7" if sp == "generic" else ""
        src.append("print(f(" + cs + ", " + arg + ", " + aval + ", " + val(n) + extra + "))")
    if shadow != "none":
        src.append("print(sh)")
    return "\n".join(src) + "\n"


def expected(cond, th, el, use, sp="direct", shadow="none"):
    res = []
    safe = True
    for (c, i, n) in INPUTS:
        r = oracle(cond, th, el, use, c, i, n, sp)
        if r is None:
            safe = False
        res.append(r)
    return safe, res


def run(args):
    name, src, safe, exp = args
    fp = os.path.join(out, name + ".vl")
    open(fp, "w").write(src)
    env = dict(os.environ, VL_STD=W + "/std")
    try:
        p = subprocess.run(["timeout", "60", VL, "run", fp,
                            "--compiler", seed], capture_output=True, text=True, env=env, cwd=W)
        rc, so, se = p.returncode, p.stdout, p.stderr
    except Exception as e:
        rc, so, se = -99, "", str(e)
    low = se.lower()
    trapish = any(t in low for t in ("trap", "unreachable", "out of bounds", "null", "runtime", "invalid", "validat"))
    if rc != 0 and so == "" and "type error" in se:
        outc = "refused"
    elif rc != 0 and so == "" and not trapish:
        outc = "emit-refused"
    elif rc != 0:
        outc = "trap"
    else:
        lines = so.strip().split("\n")
        if safe and lines == [str(x) for x in exp]:
            outc = "runs"
        else:
            outc = "wrong"
    if safe:
        grade = {"runs": "ok", "refused": "miss", "emit-refused": "EMITREF", "trap": "TRAP", "wrong": "WRONG"}[outc]
    else:
        grade = {"refused": "ok", "runs": "UNSOUND", "wrong": "UNSOUND", "trap": "UNSOUND", "emit-refused": "ok-emit"}[outc]
    return {"name": name, "safe": safe, "outcome": outc, "grade": grade, "stderr": se[-400:], "stdout": so[-300:]}


jobs = []
for place, cond, th, el, use, sp, shadow in itertools.product(PLACES, CONDS, THENS, ELSES, USES, SPELL, SHADOWS):
    if shadow != "none" and (place not in ("name", "field", "capname") or sp == "generic" or use not in ("arith", "coal")):
        continue
    src = gen(place, cond, th, el, use, sp, shadow)
    if src is None:
        continue
    name = "_".join([place, cond, th, el.replace("-", "x"), use, sp] + ([] if shadow == "none" else [shadow]))
    if flt and flt not in name:
        continue
    safe, exp = expected(cond, th, el, use, sp)
    if shadow != "none":
        exp = exp + [0]
    jobs.append((name, src, safe, exp))

with ThreadPoolExecutor(int(os.environ.get("JOBS", "8"))) as ex:
    results = list(ex.map(run, jobs))
with open(os.path.join(out, "results.jsonl"), "w") as fh:
    for r in results:
        fh.write(json.dumps(r) + "\n")
from collections import Counter
print(len(results), Counter(r["grade"] for r in results))
