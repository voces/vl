#!/usr/bin/env python3
"""Grid 4: specimen hunt.

`tests/vl_check_codegen_test.ts` needs a LIVE `check-clean invalid wasm` program.
The one it had (D22) is fixed, so this sweeps shapes ADJACENT to the class just closed
looking for a replacement: nullable UNIONS (not niches), 3-way unions with null,
same-shape arms, variants through captures / closures / casts, and generic instances
carrying union type arguments.

USAGE, from the repo root, after `bash scripts/agent-setup.sh`:

    python3 scripts/silent-sweep/nulvariant/grid4-specimenhunt.py "$PWD" /tmp/g4

It takes no label argument and writes `grid4.csv` into the output directory. The graded
records on master 675d96a1 and on the closing commit are `grid4-master.csv` /
`grid4-branch.csv` beside this script.

RESOURCE DISCIPLINE: strictly sequential `vl` invocations, no fan-out.

REBUILD THE RUST HOST BEFORE ANY `--codegen` CLAIM
(`cargo build --release --manifest-path scripts/vl-host/Cargo.toml`) -- a stale host makes
`--codegen` a no-op and every invalid module grades `runs`.
"""
import os, subprocess, sys, csv, itertools
from collections import Counter

ROOT, OUT = sys.argv[1], sys.argv[2]
VL = os.path.join(ROOT, "scripts/vl-host/target/release/vl")

CASES = {}
def add(n, src): CASES[n] = src

U2 = "type Circle = { r: i32 }\ntype Sq = { s: i32 }\ntype Shape = Circle | Sq\n"
AREA = "function area(sh: Shape): i32 {\n  if sh is Circle { return sh.r }\n  return 0\n}\n"

# --- nullable UNION (`Shape | null`) -- a BOX niche, not a variant niche -------
NU = U2 + AREA + "function mkn(): Shape | null {\n  return { r: 5 }\n}\n"
add("nulunion-arg", NU + "function go(): i32 {\n  const u = mkn()\n  if u != null { return area(u) }\n  return -1\n}\nprint(go())\n")
add("nulunion-param-arg", NU + "function go(u: Shape | null): i32 {\n  if u != null { return area(u) }\n  return -1\n}\nprint(go(mkn()))\n")
add("nulunion-literal-arg", NU + "function go(u: Shape | null): i32 {\n  if u != null { return area(u) }\n  return -1\n}\nprint(go({ r: 5 }))\n")
add("nulunion-field", NU + "type H = { u: Shape | null }\nfunction go(o: H): i32 {\n  const u = o.u\n  if u != null { return area(u) }\n  return -1\n}\nprint(go({ u: mkn() }))\n")
add("nulunion-listelem", NU + "function go(): i32 {\n  const xs: (Shape | null)[] = [mkn()]\n  const u = xs[0]\n  if u != null { return area(u) }\n  return -1\n}\nprint(go())\n")
add("nulunion-mapval", NU + "function go(): i32 {\n  const m: {[string]: Shape | null} = Map()\n  m[\"k\"] = mkn()\n  const u = m[\"k\"]\n  if u != null { return area(u) }\n  return -1\n}\nprint(go())\n")
add("nulunion-generic", NU + "function gid<T>(x: T, k: i32): i32 {\n  return k\n}\nfunction go(u: Shape | null): i32 {\n  if u != null { return gid(u, 7) }\n  return -1\n}\nprint(go(mkn()))\n")
add("nulunion-assign", NU + "function go(): i32 {\n  let u: Shape | null = null\n  u = { r: 5 }\n  if u != null { return area(u) }\n  return -1\n}\nprint(go())\n")
add("nulunion-return", NU + "function pick(c: Circle | null): Shape | null {\n  if c is Circle { return c }\n  return null\n}\nfunction go(): i32 {\n  const u = pick({ r: 5 })\n  if u != null { return area(u) }\n  return -1\n}\nprint(go())\n")

# --- 3-way union with null ----------------------------------------------------
U3 = "type Circle = { r: i32 }\ntype Sq = { s: i32 }\ntype Tri = { t: i32 }\ntype Shape3 = Circle | Sq | Tri\nfunction area3(sh: Shape3): i32 {\n  if sh is Circle { return sh.r }\n  return 0\n}\n"
add("u3-niche-arg", U3 + "function mk3(): Circle | null {\n  return { r: 5 }\n}\nfunction go(): i32 {\n  const c = mk3()\n  if c is Circle { return area3(c) }\n  return -1\n}\nprint(go())\n")
add("u3-nulunion-arg", U3 + "function mk3(): Shape3 | null {\n  return { r: 5 }\n}\nfunction go(): i32 {\n  const u = mk3()\n  if u != null { return area3(u) }\n  return -1\n}\nprint(go())\n")
add("u3-variant-generic", U3 + "function gid<T>(x: T, k: i32): i32 {\n  return k\n}\nfunction go(c: Circle): i32 {\n  return gid(c, 7)\n}\nprint(go({ r: 5 }))\n")

# --- same-SHAPE arms ----------------------------------------------------------
SS = "type Cat = { kind: i32 }\ntype Dog = { kind: i32 }\ntype Pet = Cat | Dog\nfunction kk(p: Pet): i32 {\n  if p is Cat { return p.kind }\n  return 0\n}\n"
add("sameshape-niche-arg", SS + "function mkc(): Cat | null {\n  return { kind: 5 }\n}\nfunction go(): i32 {\n  const c = mkc()\n  if c is Cat { return kk(c) }\n  return -1\n}\nprint(go())\n")
add("sameshape-literal-niche", SS + "function go(c: Cat | null): i32 {\n  if c is Cat { return kk(c) }\n  return -1\n}\nprint(go({ kind: 5 }))\n")
add("sameshape-generic", SS + "function gid<T>(x: T, k: i32): i32 {\n  return k\n}\nfunction go(c: Cat): i32 {\n  return gid(c, 7)\n}\nprint(go({ kind: 5 }))\n")

# --- variant through capture / closure / cast --------------------------------
add("variant-capture-arg", U2 + AREA + "function go(v: Circle): i32 {\n  function inner(): i32 {\n    return area(v)\n  }\n  return inner()\n}\nprint(go({ r: 5 }))\n")
add("niche-capture-arg", U2 + AREA + "function mkc(): Circle | null {\n  return { r: 5 }\n}\nfunction go(c: Circle | null): i32 {\n  if c is Circle {\n    function inner(): i32 {\n      return area(c)\n    }\n    return inner()\n  }\n  return -1\n}\nprint(go(mkc()))\n")
add("variant-as-cast-arg", U2 + AREA + "function mks(): Shape {\n  return { r: 5 }\n}\nfunction go(): i32 {\n  const c = mks() as Circle\n  return area(c)\n}\nprint(go())\n")
add("niche-asq-cast-arg", U2 + AREA + "function mks(): Shape {\n  return { r: 5 }\n}\nfunction go(): i32 {\n  const c = mks() as? Circle\n  if c is Circle { return area(c) }\n  return -1\n}\nprint(go())\n")
add("variant-lambda-arg", U2 + AREA + "function apply(f: (i32) => i32, k: i32): i32 {\n  return f(k)\n}\nfunction go(v: Circle): i32 {\n  return apply((n) => area(v) + n, 0)\n}\nprint(go({ r: 5 }))\n")

# --- generic instances carrying union / variant type args ---------------------
GA = U2 + AREA
add("generic-union-arg", GA + "function gid<T>(x: T, k: i32): i32 {\n  return k\n}\nfunction go(s: Shape): i32 {\n  return gid(s, 7)\n}\nprint(go({ r: 5 }))\n")
add("generic-union-array", GA + "function first<T>(xs: T[]): T {\n  return xs[0]\n}\nfunction go(): i32 {\n  const xs: Shape[] = [{ r: 5 }]\n  return area(first(xs))\n}\nprint(go())\n")
add("generic-variant-array", GA + "function first<T>(xs: T[]): T {\n  return xs[0]\n}\nfunction go(): i32 {\n  const xs: Circle[] = [{ r: 5 }]\n  return first(xs).r\n}\nprint(go())\n")
add("generic-niche-array", GA + "function first<T>(xs: T[]): T {\n  return xs[0]\n}\nfunction go(): i32 {\n  const xs: (Circle | null)[] = [null]\n  const c = first(xs)\n  if c is Circle { return c.r }\n  return -1\n}\nprint(go())\n")
add("generic-roundtrip-variant", GA + "function idg<T>(x: T): T {\n  return x\n}\nfunction go(v: Circle): i32 {\n  return area(idg(v))\n}\nprint(go({ r: 5 }))\n")
add("generic-roundtrip-niche", GA + "function idg<T>(x: T): T {\n  return x\n}\nfunction mkc(): Circle | null {\n  return { r: 5 }\n}\nfunction go(c: Circle | null): i32 {\n  if c is Circle { return area(idg(c)) }\n  return -1\n}\nprint(go(mkc()))\n")
add("generic-roundtrip-union", GA + "function idg<T>(x: T): T {\n  return x\n}\nfunction go(s: Shape): i32 {\n  return area(idg(s))\n}\nprint(go({ r: 5 }))\n")

# --- union of a struct and a scalar, niche side ------------------------------
MX = "type Circle = { r: i32 }\ntype Mixed = Circle | i64\nfunction mx(m: Mixed): i32 {\n  if m is Circle { return m.r }\n  return 0\n}\n"
add("mixed-niche-arg", MX + "function mkc(): Circle | null {\n  return { r: 5 }\n}\nfunction go(): i32 {\n  const c = mkc()\n  if c is Circle { return mx(c) }\n  return -1\n}\nprint(go())\n")
add("mixed-literal-niche-arg", MX + "function go(c: Circle | null): i32 {\n  if c is Circle { return mx(c) }\n  return -1\n}\nprint(go({ r: 5 }))\n")
add("mixed-generic", MX + "function gid<T>(x: T, k: i32): i32 {\n  return k\n}\nfunction go(m: Mixed): i32 {\n  return gid(m, 7)\n}\nprint(go({ r: 5 }))\n")

def run(cmd):
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=120)
    return p.returncode, (p.stdout or "") + (p.stderr or "")

def firstline(s):
    s = s.strip(); return s.splitlines()[0] if s else ""

def grade(path):
    rc, out = run([VL, "check", path])
    if "wasm trap" in out.lower() or "out of bounds" in out.lower():
        return "compiler trap", firstline(out)
    if rc != 0:
        errs = [l for l in out.splitlines() if "[ERROR]" in l]
        return ("loud emit reject" if "emitProgram" in out else "loud check reject"), (errs[0].strip() if errs else firstline(out))
    rc2, out2 = run([VL, "check", "--codegen", path])
    if "not valid wasm" in out2:
        return "check-clean invalid wasm", [l for l in out2.splitlines() if "not valid wasm" in l][0].strip()
    if rc2 != 0:
        errs = [l for l in out2.splitlines() if "[ERROR]" in l]
        return ("loud emit reject" if "emitProgram" in out2 else "loud check reject"), (errs[0].strip() if errs else firstline(out2))
    rc3, out3 = run([VL, "run", path])
    if rc3 != 0:
        if "Invalid input WebAssembly" in out3:
            return "check-clean invalid wasm", firstline(out3)
        if "trap" in out3.lower():
            return "runtime trap", firstline(out3)
        return "other error", firstline(out3)
    got = out3.strip().splitlines()
    return "runs", "printed %s" % (got[-1].strip() if got else "")

def main():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for n, src in CASES.items():
        p = os.path.join(OUT, n + ".vl")
        with open(p, "w") as f: f.write(src)
        g, d = grade(p)
        rows.append(dict(cell=n, grade=g, detail=d))
        print("%-30s %-26s %s" % (n, g, d[:90]), flush=True)
    with open(os.path.join(OUT, "grid4.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["cell", "grade", "detail"]); w.writeheader()
        for r in rows: w.writerow(r)
    print()
    for k, v in sorted(Counter(r["grade"] for r in rows).items()):
        print("  %-28s %d" % (k, v))

main()
