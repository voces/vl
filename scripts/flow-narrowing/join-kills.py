#!/usr/bin/env python3
"""Kill axes for flow narrowing's `if` join (D3285, review round 3): a write the join cannot see
by name must survive the meet. Place (captured name, field, element) x kill (a call that may
write, an alias write, a write under an inner declaration that hides the outer binding, a
computed-index write inside a loop that re-reads) x the arm holding it x what the other arm does
x whether the kill arm refills after the kill.

A cell whose kill is the last effect on its path is UNSAFE and must be refused; one that refills
is SAFE and must run printing the oracle's value (or be refused: a precision miss).

usage: join-kills.py <seed.wasm> <outdir>
"""
import itertools, json, os, subprocess, sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

W = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = W + "/scripts/vl-host/target/release/vl"
seed = os.path.abspath(sys.argv[1])
out = os.path.abspath(sys.argv[2])
os.makedirs(out, exist_ok=True)

PLACES = ["name", "field", "elem"]
KILLS = ["call", "alias", "hidden", "loopidx"]
ARMS = ["then", "else"]
OTHERS = ["fill", "refill", "none"]
REFILL = [False, True]

PRE = """function nn(v: i32): i32 | null {
  if v < 0 { return null }
  return v
}
type Box = { v: i32 | null }
function clrB(b: Box) { b.v = null }
function clrA(a: (i32 | null)[]) { a[0] = null }
"""


def gen(place, kill, arm, other, refill):
    P = {"name": "x", "field": "a.v", "elem": "xs[0]"}[place]
    if kill == "loopidx" and place != "elem":
        return None
    if kill == "alias" and place == "name":
        return None
    b = []
    if place == "name":
        b.append("  let x = nn(k)")
        b.append("  const clr = () => { x = null }")
    b.append("  " + P + " = 1")
    if kill == "call":
        kl = {"name": "clr()", "field": "clrB(b2)", "elem": "clrA(ys)"}[place]
    elif kill == "alias":
        kl = {"field": "const q = b2; q.v = null", "elem": "const q = ys; q[0] = null"}[place]
    elif kill == "hidden":
        decl = {"name": "const x = 100", "field": "const a: Box = { v: 1 }", "elem": "const xs: (i32 | null)[] = [1]"}[place]
        wr = {"name": "clr()", "field": "b2.v = null", "elem": "ys[0] = null"}[place]
        kl = "{ " + decl + "; " + wr + " }"
    else:
        kl = "let i = 0; while i < 1 { xs[i % 1] = null; i = i + 1 }"
    if refill:
        kl = kl + "; " + P + " = 7"
    oth = {"fill": P + " = 7", "refill": P + " = null; " + P + " = 7", "none": ""}[other]
    th, el = (kl, oth) if arm == "then" else (oth, kl)
    b.append("  if c { " + th + " } else { " + el + " }")
    b.append("  return " + P + " + 1")
    src = PRE
    src += "function f(k: i32, c: boolean, a: Box, b2: Box, xs: (i32 | null)[], ys: (i32 | null)[]): i32 {\n"
    src += "\n".join(b) + "\n}\n"
    for c in (True, False):
        cs = "true" if c else "false"
        src += "{\n  const o: Box = { v: 3 }\n  const l: (i32 | null)[] = [3]\n"
        src += "  print(f(2, " + cs + ", o, o, l, l))\n}\n"
    # oracle: the kill path ends null unless it refills; the other path ends 7 or 1
    exp = []
    safe = True
    for c in (True, False):
        onkill = (arm == "then") == c
        if onkill:
            if refill:
                exp.append(8)
            else:
                safe = False
                exp.append(None)
        else:
            exp.append(8 if other != "none" else 2)
    return src, safe, exp


def run(job):
    name, src, safe, exp = job
    fp = os.path.join(out, name + ".vl")
    open(fp, "w").write(src)
    env = dict(os.environ, VL_STD=W + "/std")
    p = subprocess.run(["timeout", "60", VL, "run", fp, "--compiler", seed],
                       capture_output=True, text=True, env=env, cwd=W)
    so, se = p.stdout.strip(), p.stderr
    if p.returncode != 0 and so == "" and "type error" in se:
        outc = "refused"
    elif p.returncode != 0:
        outc = "fail"
    else:
        outc = "runs" if safe and so.split("\n") == [str(x) for x in exp] else "wrong"
    if safe:
        grade = {"runs": "ok", "refused": "miss", "fail": "FAIL", "wrong": "WRONG"}[outc]
    else:
        grade = "ok" if outc == "refused" else "UNSOUND"
    return {"name": name, "grade": grade, "outcome": outc, "stderr": se[-300:]}


jobs = []
for place, kill, arm, other, refill in itertools.product(PLACES, KILLS, ARMS, OTHERS, REFILL):
    g = gen(place, kill, arm, other, refill)
    if g is None:
        continue
    src, safe, exp = g
    jobs.append(("_".join([place, kill, arm, other, "refill" if refill else "kill"]), src, safe, exp))
with ThreadPoolExecutor(int(os.environ.get("JOBS", "8"))) as ex:
    res = list(ex.map(run, jobs))
with open(os.path.join(out, "results.jsonl"), "w") as fh:
    for r in res:
        fh.write(json.dumps(r) + "\n")
print(len(res), Counter(r["grade"] for r in res))
for r in res:
    if r["grade"] not in ("ok", "miss"):
        print(r["grade"], r["name"], r["stderr"].strip().split("\n")[-1][:140])
