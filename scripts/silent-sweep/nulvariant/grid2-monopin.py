#!/usr/bin/env python3
"""D23 grid: the monomorphizer argument-pin cascade's catch-all, by REP.

One destination -- `dstGen<T>(x: T, k: i32): i32 { return k }` -- and one question:
which reps reach the `"i32"` catch-all at the bottom of `monoArgTyName`, and what
does the instance do when they do. Every cell prints 7 when it is right.

USAGE, from the repo root, after `bash scripts/agent-setup.sh`:

    python3 scripts/silent-sweep/nulvariant/grid2-monopin.py "$PWD" /tmp/g-branch branch
    python3 scripts/silent-sweep/nulvariant/delta.py \
        scripts/silent-sweep/nulvariant/grid2-master.csv /tmp/g-branch/grid2-branch.csv "GRID 2"

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

ROOT = sys.argv[1]
OUT = sys.argv[2]
LABEL = sys.argv[3]
VL = os.path.join(ROOT, "scripts/vl-host/target/release/vl")

GEN = "function dstGen<T>(x: T, k: i32): i32 {\n  return k\n}\n"

# rep -> (decls, go body, driver).  Every program prints 7 when the instance is right.
CASES = {}

def add(rep, decls, body, driver="print(go())"):
    CASES[rep] = GEN + decls + body + driver + "\n"

UNI = "type Circle = { r: i32 }\ntype Sq = { s: i32 }\ntype Shape = Circle | Sq\n"

# --- the variant family (D23's own) -----------------------------------------
add("variant-param", UNI,
    "function go(): i32 {\n  return goc({ r: 5 })\n}\nfunction goc(c: Circle): i32 {\n  return dstGen(c, 7)\n}\n")
add("nulvariant-param-is", UNI + "function mkc(): Circle | null {\n  return { r: 5 }\n}\n",
    "function goc(c: Circle | null): i32 {\n  if c is Circle { return dstGen(c, 7) }\n  return -1\n}\nfunction go(): i32 {\n  return goc(mkc())\n}\n")
add("nulvariant-param-nenull", UNI + "function mkc(): Circle | null {\n  return { r: 5 }\n}\n",
    "function goc(c: Circle | null): i32 {\n  if c != null { return dstGen(c, 7) }\n  return -1\n}\nfunction go(): i32 {\n  return goc(mkc())\n}\n")
add("nulvariant-local-is", UNI,
    "function go(): i32 {\n  const c: Circle | null = { r: 5 }\n  if c is Circle { return dstGen(c, 7) }\n  return -1\n}\n")
add("nulvariant-global-is", UNI + "const gc: Circle | null = { r: 5 }\n",
    "function go(): i32 {\n  if gc is Circle { return dstGen(gc, 7) }\n  return -1\n}\n")
add("variant-global", UNI + "const gv: Circle = { r: 5 }\n",
    "function go(): i32 {\n  return dstGen(gv, 7)\n}\n")
add("union-param", UNI,
    "function goc(s: Shape): i32 {\n  return dstGen(s, 7)\n}\nfunction go(): i32 {\n  return goc({ r: 5 })\n}\n")

# --- the other nullable niches ----------------------------------------------
add("struct-param", "type P = { a: i32 }\n",
    "function goc(p: P): i32 {\n  return dstGen(p, 7)\n}\nfunction go(): i32 {\n  return goc({ a: 1 })\n}\n")
add("nulstruct-param-is", "type P = { a: i32 }\nfunction mkp(): P | null {\n  return { a: 1 }\n}\n",
    "function goc(p: P | null): i32 {\n  if p is P { return dstGen(p, 7) }\n  return -1\n}\nfunction go(): i32 {\n  return goc(mkp())\n}\n")
add("nullist-param-nenull", "",
    "function goc(xs: i32[] | null): i32 {\n  if xs != null { return dstGen(xs, 7) }\n  return -1\n}\nfunction go(): i32 {\n  return goc([1, 2])\n}\n")
add("nulreflist-param-nenull", "type P = { a: i32 }\n",
    "function goc(xs: P[] | null): i32 {\n  if xs != null { return dstGen(xs, 7) }\n  return -1\n}\nfunction go(): i32 {\n  return goc([{ a: 1 }])\n}\n")
add("nulreflist-field-nenull", "type P = { a: i32 }\ntype Bx = { xs: P[] | null }\n",
    "function goc(o: Bx): i32 {\n  const xs = o.xs\n  if xs != null { return dstGen(xs, 7) }\n  return -1\n}\nfunction go(): i32 {\n  return goc({ xs: [{ a: 1 }] })\n}\n")
add("nulstr-param-nenull", "",
    "function goc(s: string | null): i32 {\n  if s != null { return dstGen(s, 7) }\n  return -1\n}\nfunction go(): i32 {\n  return goc(\"a\")\n}\n")
add("nulmap-param-nenull", "",
    "function goc(m: {[string]: i32} | null): i32 {\n  if m != null { return dstGen(m, 7) }\n  return -1\n}\nfunction go(): i32 {\n  const q: {[string]: i32} = Map()\n  return goc(q)\n}\n")
add("nulclosure-param-is", "",
    "function goc(f: ((i32) => i32) | null): i32 {\n  if f is (i32) => i32 { return dstGen(f, 7) }\n  return -1\n}\nfunction inc(v: i32): i32 {\n  return v + 1\n}\nfunction go(): i32 {\n  return goc(inc)\n}\n")
add("nulbool-param-nenull", "",
    "function goc(b: boolean | null): i32 {\n  if b != null { return dstGen(b, 7) }\n  return -1\n}\nfunction go(): i32 {\n  return goc(true)\n}\n")
add("nulf64list-param-nenull", "",
    "function goc(xs: f64[] | null): i32 {\n  if xs != null { return dstGen(xs, 7) }\n  return -1\n}\nfunction go(): i32 {\n  return goc([1.5])\n}\n")
add("nuli64list-param-nenull", "",
    "function goc(xs: i64[] | null): i32 {\n  if xs != null { return dstGen(xs, 7) }\n  return -1\n}\nfunction go(): i32 {\n  return goc([1])\n}\n")
add("nulf32list-param-nenull", "",
    "function goc(xs: f32[] | null): i32 {\n  if xs != null { return dstGen(xs, 7) }\n  return -1\n}\nfunction go(): i32 {\n  return goc([1.5])\n}\n")
add("u8list-param", "",
    "function goc(b: u8[]): i32 {\n  return dstGen(b, 7)\n}\nfunction go(): i32 {\n  const z: u8[] = []\n  return goc(z)\n}\n")
add("u8list-local", "",
    "function go(): i32 {\n  const z: u8[] = []\n  return dstGen(z, 7)\n}\n")
# --- controls that must NOT move --------------------------------------------
add("i32-param", "", "function goc(v: i32): i32 {\n  return dstGen(v, 7)\n}\nfunction go(): i32 {\n  return goc(1)\n}\n")
add("string-param", "", "function goc(s: string): i32 {\n  return dstGen(s, 7)\n}\nfunction go(): i32 {\n  return goc(\"a\")\n}\n")
add("i32list-param", "", "function goc(xs: i32[]): i32 {\n  return dstGen(xs, 7)\n}\nfunction go(): i32 {\n  return goc([1])\n}\n")
add("bool-literal", "", "function go(): i32 {\n  return dstGen(true, 7)\n}\n")
add("i32-literal", "", "function go(): i32 {\n  return dstGen(1, 7)\n}\n")

def run(cmd):
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=120)
    return p.returncode, (p.stdout or "") + (p.stderr or "")

def firstline(s):
    s = s.strip()
    return s.splitlines()[0] if s else ""

def grade(path, exp=7):
    rc, out = run([VL, "check", path])
    low = out.lower()
    if "wasm trap" in low or "unreachable executed" in low or "out of bounds" in low:
        return "compiler trap", firstline(out)
    if rc != 0:
        errs = [l for l in out.splitlines() if "[ERROR]" in l]
        msg = errs[0].strip() if errs else firstline(out)
        return ("loud emit reject" if "emitProgram" in out else "loud check reject"), msg
    rc2, out2 = run([VL, "check", "--codegen", path])
    if "wasm trap" in out2.lower():
        return "compiler trap", firstline(out2)
    if "not valid wasm" in out2:
        return "check-clean invalid wasm", [l for l in out2.splitlines() if "not valid wasm" in l][0].strip()
    if rc2 != 0:
        errs = [l for l in out2.splitlines() if "[ERROR]" in l]
        msg = errs[0].strip() if errs else firstline(out2)
        return ("loud emit reject" if "emitProgram" in out2 else "loud check reject"), msg
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
    for rep, src in CASES.items():
        path = os.path.join(OUT, rep + ".vl")
        with open(path, "w") as f:
            f.write(src)
        g, detail = grade(path)
        rows.append(dict(cell=rep, grade=g, detail=detail))
        print("%-32s %s" % (rep, g), flush=True)
    csvp = os.path.join(OUT, "grid2-%s.csv" % LABEL)
    with open(csvp, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["cell", "grade", "detail"])
        w.writeheader()
        for r in rows: w.writerow(r)
    print("\nwrote", csvp, "(%d cells)" % len(rows))
    for k, v in sorted(Counter(r["grade"] for r in rows).items()):
        print("  %-28s %d" % (k, v))

main()
