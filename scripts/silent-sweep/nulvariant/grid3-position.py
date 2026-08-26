#!/usr/bin/env python3
"""Grid 3: the nulvariant niche by POSITION, both directions.

Direction A (D24's): a NARROWED `Circle | null` delivered into a UNION-typed position --
does that position box it?
Direction B (D22's): an object LITERAL delivered into a `Circle | null` position -- does
that position build the bare variant, or box it into the niche?

The argument boundary is one position among many; this is the axis that says whether the
fix belongs at the boundary or one layer down in `emitUnionCoerce` / `emitObj`.

USAGE, from the repo root, after `bash scripts/agent-setup.sh`:

    python3 scripts/silent-sweep/nulvariant/grid3-position.py "$PWD" /tmp/g-branch branch
    python3 scripts/silent-sweep/nulvariant/delta.py \
        scripts/silent-sweep/nulvariant/grid3-master.csv /tmp/g-branch/grid3-branch.csv "GRID 3"

RESOURCE DISCIPLINE: these run `vl` STRICTLY SEQUENTIALLY -- one invocation at a time, no
fan-out at all. The sibling `sweep.sh` fans four; nothing here raises that, and nothing here
needs to (the whole set is 168 cells and finishes in under a minute).

REBUILD THE RUST HOST BEFORE ANY `--codegen` CLAIM
(`cargo build --release --manifest-path scripts/vl-host/Cargo.toml`). A stale host makes
`--codegen` a no-op that prints `unknown CLI command 10 from the wasm pump`, and every
invalid module then grades `runs`.

The `*-master.csv` files beside this script are the graded records taken on master 675d96a1,
so a re-run has something to diff against without rebuilding the old compiler.
"""
import os, subprocess, sys, csv
from collections import Counter

ROOT, OUT, LABEL = sys.argv[1], sys.argv[2], sys.argv[3]
VL = os.path.join(ROOT, "scripts/vl-host/target/release/vl")

PRE = "type Circle = { r: i32 }\ntype Sq = { s: i32 }\ntype Shape = Circle | Sq\n"
MKC = "function mkc(): Circle | null {\n  return { r: 5 }\n}\n"
AREA = "function area(sh: Shape): i32 {\n  if sh is Circle { return sh.r }\n  return 0\n}\n"

CASES = {}
def add(name, src, exp):
    CASES[name] = (src, exp)

# ---- direction A: a narrowed niche into a UNION position --------------------
def A(name, body, exp=5, extra=""):
    add("A-" + name, PRE + AREA + MKC + extra + body + "print(go(mkc()))\n", exp)

A("call-arg", "function go(c: Circle | null): i32 {\n  if c is Circle { return area(c) }\n  return -1\n}\n")
A("return", "function pick(c: Circle | null): Shape {\n  if c is Circle { return c }\n  return { s: 0 }\n}\nfunction go(c: Circle | null): i32 {\n  return area(pick(c))\n}\n")
A("let-ann", "function go(c: Circle | null): i32 {\n  if c is Circle {\n    const s: Shape = c\n    return area(s)\n  }\n  return -1\n}\n")
A("list-elem", "function go(c: Circle | null): i32 {\n  if c is Circle {\n    const xs: Shape[] = [c]\n    return area(xs[0])\n  }\n  return -1\n}\n")
A("list-push", "function go(c: Circle | null): i32 {\n  if c is Circle {\n    const xs: Shape[] = []\n    xs.push(c)\n    return area(xs[0])\n  }\n  return -1\n}\n")
A("struct-field", "function go(c: Circle | null): i32 {\n  if c is Circle {\n    const o: Holder = { s: c }\n    return area(o.s)\n  }\n  return -1\n}\n", extra="type Holder = { s: Shape }\n")
A("map-value", "function go(c: Circle | null): i32 {\n  if c is Circle {\n    const m: {[string]: Shape} = Map()\n    m[\"k\"] = c\n    const v = m[\"k\"]\n    if v != null { return area(v) }\n    return -3\n  }\n  return -1\n}\n")
A("assign-local", "function go(c: Circle | null): i32 {\n  let s: Shape = { s: 0 }\n  if c is Circle { s = c }\n  return area(s)\n}\n")
A("if-expr-arm", "function pick(c: Circle | null): Shape {\n  if c is Circle { return c } else { return { s: 0 } }\n}\nfunction go(c: Circle | null): i32 {\n  return area(pick(c))\n}\n")
A("nested-call-arg", "function go(c: Circle | null): i32 {\n  if c is Circle { return area2(area(c), c) }\n  return -1\n}\nfunction area2(k: i32, sh: Shape): i32 {\n  return k + area(sh) - area(sh)\n}\n")
A("global-cell", "const gs: Shape = gmk()\nfunction gmk(): Shape {\n  const c = mkc()\n  if c is Circle { return c }\n  return { s: 0 }\n}\nfunction go(c: Circle | null): i32 {\n  return area(gs)\n}\n")

# ---- direction B: an object LITERAL into a `Circle | null` position ---------
def B(name, body, exp=5, extra=""):
    add("B-" + name, PRE + AREA + extra + body, exp)

B("call-arg", "function take(v: Circle | null): i32 {\n  if v is Circle { return v.r }\n  return -1\n}\nprint(take({ r: 5 }))\n")
B("return", "function mk(): Circle | null {\n  return { r: 5 }\n}\nfunction go(): i32 {\n  const c = mk()\n  if c is Circle { return c.r }\n  return -1\n}\nprint(go())\n")
B("let-ann", "function go(): i32 {\n  const c: Circle | null = { r: 5 }\n  if c is Circle { return c.r }\n  return -1\n}\nprint(go())\n")
B("list-elem", "function go(): i32 {\n  const xs: (Circle | null)[] = [{ r: 5 }]\n  const c = xs[0]\n  if c is Circle { return c.r }\n  return -1\n}\nprint(go())\n")
B("map-value", "function go(): i32 {\n  const m: {[string]: Circle | null} = Map()\n  m[\"k\"] = { r: 5 }\n  const c = m[\"k\"]\n  if c is Circle { return c.r }\n  return -1\n}\nprint(go())\n")
B("global-cell", "const gc: Circle | null = { r: 5 }\nfunction go(): i32 {\n  if gc is Circle { return gc.r }\n  return -1\n}\nprint(go())\n")
B("assign-local", "function go(): i32 {\n  let c: Circle | null = null\n  c = { r: 5 }\n  if c is Circle { return c.r }\n  return -1\n}\nprint(go())\n")
B("nested-call-arg", "function take(k: i32, v: Circle | null): i32 {\n  if v is Circle { return v.r + k }\n  return -1\n}\nprint(take(0, { r: 5 }))\n")
B("captured-call-arg", "function go(): i32 {\n  const bias = 0\n  function inner(v: Circle | null): i32 {\n    if v is Circle { return v.r + bias }\n    return -1\n  }\n  return inner({ r: 5 })\n}\nprint(go())\n")

def run(cmd):
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=120)
    return p.returncode, (p.stdout or "") + (p.stderr or "")

def firstline(s):
    s = s.strip()
    return s.splitlines()[0] if s else ""

def grade(path, exp):
    rc, out = run([VL, "check", path])
    low = out.lower()
    if "wasm trap" in low or "unreachable executed" in low or "out of bounds" in low:
        return "compiler trap", firstline(out)
    if rc != 0:
        errs = [l for l in out.splitlines() if "[ERROR]" in l]
        return ("loud emit reject" if "emitProgram" in out else "loud check reject"), (errs[0].strip() if errs else firstline(out))
    rc2, out2 = run([VL, "check", "--codegen", path])
    if "wasm trap" in out2.lower():
        return "compiler trap", firstline(out2)
    if "not valid wasm" in out2:
        return "check-clean invalid wasm", [l for l in out2.splitlines() if "not valid wasm" in l][0].strip()
    if rc2 != 0:
        errs = [l for l in out2.splitlines() if "[ERROR]" in l]
        return ("loud emit reject" if "emitProgram" in out2 else "loud check reject"), (errs[0].strip() if errs else firstline(out2))
    rc3, out3 = run([VL, "run", path])
    if rc3 != 0:
        if "Invalid input WebAssembly" in out3:
            return "check-clean invalid wasm", [l for l in out3.splitlines() if "Invalid input" in l][0].strip()
        if "trap" in out3.lower():
            return "runtime trap", firstline(out3)
        return "other error", firstline(out3)
    got = out3.strip().splitlines()
    got = got[-1].strip() if got else ""
    if got == str(exp):
        return "runs", "printed %s" % got
    return "runs but wrong value", "printed %s want %s" % (got, exp)

def main():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for name, (src, exp) in CASES.items():
        path = os.path.join(OUT, name + ".vl")
        with open(path, "w") as f: f.write(src)
        g, d = grade(path, exp)
        rows.append(dict(cell=name, grade=g, detail=d))
        print("%-28s %s" % (name, g), flush=True)
    csvp = os.path.join(OUT, "grid3-%s.csv" % LABEL)
    with open(csvp, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["cell", "grade", "detail"]); w.writeheader()
        for r in rows: w.writerow(r)
    print("\nwrote", csvp, "(%d cells)" % len(rows))
    for k, v in sorted(Counter(r["grade"] for r in rows).items()):
        print("  %-28s %d" % (k, v))

main()
