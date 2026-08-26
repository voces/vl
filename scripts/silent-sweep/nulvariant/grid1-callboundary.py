#!/usr/bin/env python3
"""nulvariant call-boundary cross-product grid (D22/D23/D24).

Axes:  arg form  x  narrowing  x  destination (param shape + callee kind)

UNMASKING NOTE: v1 of this grid drove every `narrowed-param` cell with
`print(go({ r: 5 }))` -- an object LITERAL into a `Circle | null` parameter, which
is D22 itself. That masked every inner cell behind D22's own failure in the SAME
module. Every driver that has to hand a `Circle | null` now goes through `mkc()`,
so the only cell that exercises the literal->niche boundary is the one that means to.

USAGE, from the repo root, after `bash scripts/agent-setup.sh`:

    python3 scripts/silent-sweep/nulvariant/grid1-callboundary.py "$PWD" /tmp/g-branch branch
    python3 scripts/silent-sweep/nulvariant/delta.py \
        scripts/silent-sweep/nulvariant/grid1-master.csv /tmp/g-branch/grid-branch.csv "GRID 1"

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

ROOT = sys.argv[1]            # repo/worktree root
OUT = sys.argv[2]             # output dir for .vl files
LABEL = sys.argv[3]           # "baseline" / "branch"
VL = os.path.join(ROOT, "scripts/vl-host/target/release/vl")

PRELUDE = """type Circle = { r: i32 }
type Sq = { s: i32 }
type Shape = Circle | Sq
"""

MKC = """function mkc(): Circle | null {
  return { r: 5 }
}
"""

BUMP = """function bump(acc: Shape, x: i32): Shape {
  if acc is Circle { return { r: acc.r + x } }
  return acc
}
"""

# ---------------------------------------------------------------- destinations
# call(e)     -> statement text placed inside the narrowed block, `e` is the argument expr
# ufcs        -> the destination is a UFCS receiver position (skipped for non-ident args)
DESTS = {
  "direct-union": dict(
    decls="function dstUnion(sh: Shape): i32 {\n  if sh is Circle { return sh.r }\n  return 0\n}\n",
    call=lambda e: "return dstUnion(%s)" % e,
    exp=lambda r: r, nullexp=None, std=False, ufcs=False),
  "direct-nulvariant": dict(
    decls="function dstNulVar(v: Circle | null): i32 {\n  if v is Circle { return v.r }\n  return -7\n}\n",
    call=lambda e: "return dstNulVar(%s)" % e,
    exp=lambda r: r, nullexp=-7, std=False, ufcs=False),
  "direct-struct": dict(
    decls="function dstStruct(x: Circle): i32 {\n  return x.r\n}\n",
    call=lambda e: "return dstStruct(%s)" % e,
    exp=lambda r: r, nullexp=None, std=False, ufcs=False),
  "generic-T": dict(
    decls="function dstGen<T>(x: T, k: i32): i32 {\n  return k\n}\n",
    call=lambda e: "return dstGen(%s, 7)" % e,
    exp=lambda r: 7, nullexp=7, std=False, ufcs=False),
  "generic-initA": dict(
    decls=BUMP + "function dstRed<A>(f: (A, i32) => A, init: A): A {\n  return f(init, 1)\n}\n",
    call=lambda e: "const out = dstRed(bump, %s)\n    if out is Circle { return out.r }\n    return -2" % e,
    exp=lambda r: r + 1, nullexp=None, std=False, ufcs=False),
  "ufcs-union": dict(
    decls="function dstUnion(sh: Shape): i32 {\n  if sh is Circle { return sh.r }\n  return 0\n}\n",
    call=lambda e: "return %s.dstUnion()" % e,
    exp=lambda r: r, nullexp=None, std=False, ufcs=True),
  "ufcs-struct": dict(
    decls="function dstStruct(x: Circle): i32 {\n  return x.r\n}\n",
    call=lambda e: "return %s.dstStruct()" % e,
    exp=lambda r: r, nullexp=None, std=False, ufcs=True),
  "std-reduce": dict(
    decls=BUMP,
    call=lambda e: "const out = reduce([1, 2], bump, %s)\n    if out is Circle { return out.r }\n    return -2" % e,
    exp=lambda r: r + 3, nullexp=None, std=True, ufcs=False),
}

# ---------------------------------------------------------------- arg forms
def cond(var, nw):
    return ("%s is Circle" % var) if nw == "is" else ("%s != null" % var)

# builder(call, nw) -> (extra decls, body, driver, arg-is-ident)
ARGFORMS = {
  "literal": (False, lambda call, nw: (
      "", "function go(): i32 {\n    %s\n}\n" % call("{ r: 5 }"),
      "print(go())", False)),
  "bare-null": (False, lambda call, nw: (
      "", "function go(): i32 {\n    %s\n}\n" % call("null"),
      "print(go())", False)),
  "narrowed-param": (True, lambda call, nw: (
      MKC,
      "function go(c: Circle | null): i32 {\n  if %s {\n    %s\n  }\n  return -1\n}\n"
          % (cond("c", nw), call("c")),
      "print(go(mkc()))", True)),
  "narrowed-local": (True, lambda call, nw: (
      "",
      "function go(): i32 {\n  const c: Circle | null = { r: 5 }\n  if %s {\n    %s\n  }\n  return -1\n}\n"
          % (cond("c", nw), call("c")),
      "print(go())", True)),
  "call-result": (True, lambda call, nw: (
      MKC,
      "function go(): i32 {\n  const c = mkc()\n  if %s {\n    %s\n  }\n  return -1\n}\n"
          % (cond("c", nw), call("c")),
      "print(go())", True)),
  "field-read": (True, lambda call, nw: (
      MKC + "type Box = { c: Circle | null }\n",
      "function go(o: Box): i32 {\n  const c = o.c\n  if %s {\n    %s\n  }\n  return -1\n}\n"
          % (cond("c", nw), call("c")),
      "print(go({ c: mkc() }))", True)),
  "nested-binding": (True, lambda call, nw: (
      MKC,
      "function go(c: Circle | null): i32 {\n  if %s {\n    const d = c\n    %s\n  }\n  return -1\n}\n"
          % (cond("c", nw), call("d")),
      "print(go(mkc()))", True)),
}

def build(afname, nw, dname):
    d = DESTS[dname]
    _, builder = ARGFORMS[afname]
    decls, body, driver, is_ident = builder(d["call"], nw)
    if d["ufcs"] and not is_ident:
        return None, None
    src = ""
    if d["std"]:
        src += 'import { reduce } from "std:array"\n'
    src += PRELUDE + d["decls"] + decls + body + driver + "\n"
    exp = d["nullexp"] if afname == "bare-null" else d["exp"](5)
    return src, exp

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
        msg = errs[0].strip() if errs else firstline(out)
        return ("loud emit reject" if "emitProgram" in out else "loud check reject"), msg
    rc2, out2 = run([VL, "check", "--codegen", path])
    low2 = out2.lower()
    if "wasm trap" in low2 or "unreachable executed" in low2:
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
    if exp is None:
        return "runs", "printed %s (no expectation)" % got
    if got == str(exp):
        return "runs", "printed %s" % got
    return "runs but wrong value", "printed %s want %s" % (got, exp)

def main():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for afname, (needs_nw, _) in ARGFORMS.items():
        for nw in (["is", "ne-null"] if needs_nw else ["na"]):
            for dname in DESTS:
                src, exp = build(afname, nw, dname)
                if src is None:
                    continue
                cell = "%s__%s__%s" % (afname, nw, dname)
                path = os.path.join(OUT, cell + ".vl")
                with open(path, "w") as f:
                    f.write(src)
                g, detail = grade(path, exp)
                rows.append(dict(cell=cell, argform=afname, narrowing=nw, dest=dname,
                                 expected=("" if exp is None else exp), grade=g, detail=detail))
                print("%-58s %s" % (cell, g), flush=True)
    csvp = os.path.join(OUT, "grid-%s.csv" % LABEL)
    with open(csvp, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["cell", "argform", "narrowing", "dest", "expected", "grade", "detail"])
        w.writeheader()
        for r in rows: w.writerow(r)
    print("\nwrote", csvp, "(%d cells)" % len(rows))
    for k, v in sorted(Counter(r["grade"] for r in rows).items()):
        print("  %-28s %d" % (k, v))

main()
