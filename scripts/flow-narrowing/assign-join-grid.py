#!/usr/bin/env python3
"""The null-assign join grid of flow narrowing (SP-010, D3556): binding x assign form x kill x
reader. Each cell is `if x == null { <assign> }` (or a sibling spelling of it) followed by an
optional call that may write `x`, then one reader of `x`.

Every cell runs its function over all inputs, and a Python oracle walks the same paths. A SAFE
cell (no path reaches a strict reader with `null`) must run and print the oracle's output, or be
refused (`miss`, a precision gap). An UNSAFE cell must be refused: accepting it is `UNSOUND`.
`??` and `is` readers are total, so every one of their cells is SAFE and must run.

usage: assign-join-grid.py <seed.wasm> <outdir> [--filter substr]    (JOBS=8 by default)
       join-compare.py <outdir-before> <outdir-after>                 transitions and runs lost
"""
import itertools, json, os, subprocess, sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

W = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = W + "/scripts/vl-host/target/release/vl"
seed = os.path.abspath(sys.argv[1])
out = os.path.abspath(sys.argv[2])
flt = sys.argv[4] if len(sys.argv) > 4 and sys.argv[3] == "--filter" else ""
os.makedirs(out, exist_ok=True)

BINDS = ["local", "hole", "param", "global", "field"]
# Each assign form: (source with X for the place, oracle(x, c, k) -> x after the `if`).
# `x` is None or an int n (the S's field); c a boolean input, k a loop count.
FORMS = {
    "direct": ("if X == null { X = { n: 7 } }", lambda x, c, k: 7 if x is None else x),
    "fresh": ("if X == null {\n    const fresh: S = { n: 7 }\n    X = fresh\n  }",
              lambda x, c, k: 7 if x is None else x),
    "call": ("if X == null { X = make(8) }", lambda x, c, k: 8 if x is None else x),
    "nest2": ("if X == null {\n    if c { X = make(1) } else { X = make(2) }\n  }",
              lambda x, c, k: (1 if c else 2) if x is None else x),
    "nest1": ("if X == null {\n    if c { X = make(1) }\n  }",
              lambda x, c, k: (1 if c else None) if x is None else x),
    "nestnull": ("if X == null {\n    if c { X = make(1) } else { X = null }\n  }",
                 lambda x, c, k: (1 if c else None) if x is None else x),
    "nestafter": ("if X == null {\n    if c { X = null }\n    X = make(3)\n  }",
                  lambda x, c, k: 3 if x is None else x),
    "loop": ("if X == null {\n    let i = 0\n    while i < k { X = make(10 + i); i = i + 1 }\n  }",
             lambda x, c, k: (10 + k - 1 if k > 0 else None) if x is None else x),
    "loopafter": ("if X == null {\n    X = make(5)\n    let i = 0\n    while i < k { X = make(10 + i); i = i + 1 }\n  }",
                  lambda x, c, k: (10 + k - 1 if k > 0 else 5) if x is None else x),
    "loopnull": ("if X == null {\n    X = make(5)\n    let i = 0\n    while i < k { X = null; i = i + 1 }\n  }",
                 lambda x, c, k: (None if k > 0 else 5) if x is None else x),
    "else": ("if X == null { X = make(6) } else { X = make(X.n + 100) }",
             lambda x, c, k: 6 if x is None else x + 100),
    "ne": ("if X != null { } else { X = make(4) }", lambda x, c, k: 4 if x is None else x),
    "isnull": ("if X is null { X = make(4) }", lambda x, c, k: 4 if x is None else x),
    "early": ("if X == null { return -1 }", None),
    "or": ("if X == null || c { X = make(11) }", lambda x, c, k: 11 if (x is None or c) else x),
    "and": ("if X == null && c { X = make(12) }", lambda x, c, k: 12 if (x is None and c) else x),
    "earlyassign": ("if X == null {\n    if c { return -1 }\n    X = make(13)\n  }", None),
    "earlynest": ("if X == null {\n    if c { return -1 }\n  }", None),
    "valueif": ("const z = if X == null { X = make(16)\n 1 } else { 2 }", lambda x, c, k: 16 if x is None else x),
    "elseif": ("if c { } else if X == null { X = make(9) }",
               lambda x, c, k: (x if c else (9 if x is None else x))),
}
KILLS = ["none", "kill", "noop"]
READS = ["deliver", "infer", "field", "method", "pass", "clos", "coal", "is"]
STRICT = {"deliver", "infer", "field", "method", "pass", "clos"}
INPUTS = [(c, x, k) for c in (True, False) for x in (None, 3) for k in (0, 2)]


def reader(r, X):
    if r == "deliver":
        return ["const t: S = " + X, "return t.n"]
    if r == "infer":
        return ["const t = " + X, "return t.n"]
    if r == "field":
        return ["return " + X + ".n"]
    if r == "method":
        return ["return " + X + ".val()"]
    if r == "pass":
        return ["return need(" + X + ")"]
    if r == "clos":
        return ["const q = (): i32 => " + X + ".n", "return q()"]
    if r == "coal":
        return ["return (" + X + " ?? make(-5)).n"]
    if r == "is":
        return ["if " + X + " is S { return " + X + ".n }", "return -9"]
    raise Exception(r)


def gen(b, form, kill, r):
    X = {"local": "x", "hole": "x", "param": "x", "global": "g", "field": "o.f"}[b]
    src = ["type S = { n: i32 }", "type O = { f: S | null }",
           "function make(n: i32): S { return { n: n } }",
           "function val(self: S): i32 { return self.n }",
           "function need(s: S): i32 { return s.n * 2 }",
           "function mk0(n: i32): S | null { if n < 0 { return null } return make(n) }",
           "function noop(): i32 { return 0 }"]
    if b == "global":
        src.append("let g: S | null = null")
        src.append("function clear() { g = null }")
    if b == "field":
        src.append("function clear(o: O) { o.f = null }")
    params = "c: boolean, k: i32, " + ("x: S | null" if b == "param" else "init: S | null")
    body = []
    if b == "local":
        body.append("let x: S | null = init")
    elif b == "hole":
        body.append("let x = mk0(init?.n ?? -1)")
    elif b == "global":
        body.append("g = init")
    elif b == "field":
        body.append("const o: O = { f: init }")
    if kill != "none" and b in ("local", "hole", "param"):
        body.append("const clear = () => { x = null }")
    body += FORMS[form][0].replace("X", X).split("\n")
    if kill == "kill":
        body.append("clear(o)" if b == "field" else "clear()")
    elif kill == "noop":
        body.append("noop()")
    body += reader(r, X)
    src.append("function f(" + params + "): i32 {")
    src += ["  " + l.strip() for l in body]
    src.append("}")
    for (c, x, k) in INPUTS:
        arg = "null" if x is None else "make(" + str(x) + ")"
        src.append("print(f(" + ("true" if c else "false") + ", " + str(k) + ", " + arg + "))")
    return "\n".join(src) + "\n"


def oracle(form, kill, r, c, x, k):
    fn = FORMS[form][1]
    if form == "earlynest":
        if x is None:
            if c:
                return -1
            v = None
        else:
            v = x
    elif form == "earlyassign":
        if x is None and c:
            return -1
        v = 13 if x is None else x
    elif fn is None:
        if x is None:
            return -1
        v = x
    else:
        v = fn(x, c, k)
    if kill == "kill":
        v = None
    if v is None:
        if r in STRICT:
            return None
        return -5 if r == "coal" else -9
    if r == "pass":
        return v * 2
    return v


def run(args):
    name, src, safe, exp = args
    fp = os.path.join(out, name + ".vl")
    open(fp, "w").write(src)
    env = dict(os.environ, VL_STD=W + "/std")
    try:
        p = subprocess.run(["timeout", "60", VL, "run", fp, "--compiler", seed],
                           capture_output=True, text=True, env=env, cwd=W)
        rc, so, se = p.returncode, p.stdout, p.stderr
    except Exception as e:
        rc, so, se = -99, "", str(e)
    if rc != 0 and so == "" and ("error" in se.lower()) and "trap" not in se.lower() and "valid" not in se.lower():
        outc = "refused"
    elif rc != 0:
        outc = "trap"
    else:
        lines = so.strip().split("\n")
        outc = "runs" if safe and lines == [str(v) for v in exp] else "wrong"
    if safe:
        grade = {"runs": "ok", "refused": "miss", "trap": "TRAP", "wrong": "WRONG"}[outc]
    else:
        grade = {"refused": "ok", "runs": "UNSOUND", "wrong": "UNSOUND", "trap": "UNSOUND"}[outc]
    return {"name": name, "safe": safe, "outcome": outc, "grade": grade,
            "stderr": se[-400:], "stdout": so[-300:]}


jobs = []
for b, form, kill, r in itertools.product(BINDS, FORMS, KILLS, READS):
    if form.startswith("early") and kill != "none":
        continue
    name = "_".join([b, form, kill, r])
    if flt and flt not in name:
        continue
    exp = [oracle(form, kill, r, c, x, k) for (c, x, k) in INPUTS]
    jobs.append((name, gen(b, form, kill, r), all(v is not None for v in exp), exp))

with ThreadPoolExecutor(int(os.environ.get("JOBS", "8"))) as ex:
    results = list(ex.map(run, jobs))
with open(os.path.join(out, "results.jsonl"), "w") as fh:
    for res in results:
        fh.write(json.dumps(res) + "\n")
print(len(results), Counter(res["grade"] for res in results))
