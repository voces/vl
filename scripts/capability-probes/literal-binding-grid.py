#!/usr/bin/env python3
"""The literal-binding grid (DECISIONS.md §"A literal binding takes its type from its uses",
owner ruling B' + C, 2026-09-29).

    python3 scripts/capability-probes/literal-binding-grid.py [--compiler W] [--before W] [--jobs N]

One program per cell of binding kind (let/const) x scope (module/function/closure) x literal
(int/negated int/float) x use (assign, compound, argument, field, element, typed let,
arithmetic, comparison, return, index) x destination type (i32/i64/f32/f64/u8). Each program
performs the one use and then prints `b / 3` and `b * 1000000000`, which tell the four scalar
types apart.

Each cell is graded against the program the rule says it is:
  * a `let` is its program with the annotation the rule computes here (`let_type`): the join of
    its deliveries and stores within its literal's kind, operands choosing nothing;
  * a `const` is its program with every read replaced by the literal itself.
The cell must print what that program prints, or be refused where it is refused. `--before`
runs an older compiler too and lists the cells whose output moved. Exits non-zero on any cell
that disagrees with its rule program.
"""

import argparse
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = os.path.join(ROOT, "scripts", "vl-host", "target", "release", "vl")

LITS = {"int": "7", "neg": "-7", "float": "2.5"}
DESTS = ["i32", "i64", "f32", "f64", "u8"]
USES = ["assign", "compound", "arg", "field", "element", "typedlet", "arith", "compare", "return", "index"]
DELIVERIES = {"arg", "field", "element", "typedlet", "return", "index"}
STORES = {"assign", "compound"}


def kind_of(lit):
    return "float" if lit == "float" else "int"


def in_kind(lit, t):
    return t in (("f32", "f64") if kind_of(lit) == "float" else ("i32", "i64"))


def let_type(lit, use, dest):
    """The type B' gives a `let`: a delivery or store of the literal's own kind sets it (the index
    of a list is an `i32`, of an `i64`-keyed map an `i64`); anything else keeps the default."""
    default = "f64" if kind_of(lit) == "float" else "i32"
    if use in STORES:
        # A store joins with the literal's own type: an `f32` stored into a float keeps `f64`.
        if dest != "u8" and in_kind(lit, dest):
            return dest if kind_of(lit) == "int" else "f64"
        return default
    if use in DELIVERIES:
        t = dest
        if use == "index":
            t = "i32" if dest == "i32" else "i64"
        if t != "u8" and in_kind(lit, t):
            return t
    return default


def valid(kind, scope, lit, use, dest):
    if kind == "const" and use in STORES:
        return False
    if dest == "u8" and use != "element":
        return False
    if use == "index":
        if dest not in ("i32", "i64") or lit == "neg":
            return False
    if use == "return" and scope == "closure":
        return False
    return True


def prelude(dest):
    d = "i32" if dest == "u8" else dest
    return "\n".join([
        f"function mk(): {d} {{ return 1 as {d} }}" if d != "i32" else "function mk(): i32 { return 1 }",
        f"function take(x: {d}): {d} {{ return x }}",
        f"type R = {{ f: {d} }}",
    ]) + "\n"


def use_stmt(use, dest):
    d = "i32" if dest == "u8" else dest
    if use == "assign":
        return "b = mk()"
    if use == "compound":
        return "b += mk()"
    if use == "arg":
        return "print(take(b))"
    if use == "field":
        return "const r: R = { f: 0 }\nr.f = b\nprint(r.f)"
    if use == "element":
        return f"const xs: {dest}[] = [0]\nxs[0] = b\nprint(xs[0])"
    if use == "typedlet":
        return f"const y: {d} = b\nprint(y)"
    if use == "arith":
        return "const y = b + mk()\nprint(y)"
    if use == "compare":
        return 'if b < mk() { print("lt") } else { print("ge") }'
    if use == "index":
        if dest == "i32":
            return "const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8]\nprint(xs[b])"
        return "const m: {[i64]: i32} = Map()\nm[b] = 3\nprint(m[b] ?? 0)"
    raise ValueError(use)


def indent(s, n):
    return "\n".join(" " * n + l if l else l for l in s.splitlines())


PROOF = "print(b / 3)\nprint(b * 1000000000)"


def program(kind, scope, lit, use, dest, ann=None):
    d = "i32" if dest == "u8" else dest
    decl = f"{kind} b{': ' + ann if ann else ''} = {LITS[lit]}"
    body = "" if use == "return" else use_stmt(use, dest)
    src = prelude(dest)
    if scope == "module":
        if use == "return":
            src += f"{decl}\nfunction ret(): {d} {{ return b }}\nprint(ret())\n{PROOF}\n"
        else:
            src += f"{decl}\n{body}\n{PROOF}\n"
    elif scope == "function":
        if use == "return":
            src += f"function outer(): {d} {{\n  {decl}\n{indent(PROOF, 2)}\n  return b\n}}\nprint(outer())\n"
        else:
            src += f"function outer() {{\n  {decl}\n{indent(body, 2)}\n{indent(PROOF, 2)}\n}}\nouter()\n"
    else:
        src += (f"function outer() {{\n  {decl}\n  const use = () => {{\n{indent(body, 4)}\n  }}\n  use()\n"
                f"{indent(PROOF, 2)}\n}}\nouter()\n")
    return src


def substituted(kind, scope, lit, use, dest):
    """The `const` cell with every read of `b` replaced by its literal."""
    out = []
    for line in program(kind, scope, lit, use, dest).split("\n"):
        if re.match(r"^\s*const b = ", line):
            continue
        out.append(re.sub(r"\bb\b", "(" + LITS[lit] + ")", line))
    return "\n".join(out)


def run(compiler, path):
    env = dict(os.environ, VL_STD=os.path.join(ROOT, "std"))
    c = subprocess.run([VL, "check", path, "--compiler", compiler], env=env, capture_output=True, text=True,
                       timeout=120)
    if c.returncode != 0:
        return "check", ""
    r = subprocess.run([VL, "run", path, "--compiler", compiler], env=env, capture_output=True, text=True,
                       timeout=120)
    if r.returncode != 0:
        return "trap", r.stdout + r.stderr
    return "runs", r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--compiler", default=os.path.join(ROOT, "build", "vl-compiler.wasm"))
    ap.add_argument("--before")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--keep")
    a = ap.parse_args()
    cells = []
    for kind in ("let", "const"):
        for scope in ("module", "function", "closure"):
            for lit in LITS:
                for use in USES:
                    for dest in DESTS:
                        if valid(kind, scope, lit, use, dest):
                            cells.append((kind, scope, lit, use, dest))
    tmp = a.keep or tempfile.mkdtemp(prefix="nb-grid-")
    os.makedirs(tmp, exist_ok=True)

    def grade(cell):
        kind, scope, lit, use, dest = cell
        name = "_".join(cell)
        path = os.path.join(tmp, name + ".vl")
        with open(path, "w") as fh:
            fh.write(program(*cell))
        rule = os.path.join(tmp, name + ".rule.vl")
        t = None
        with open(rule, "w") as fh:
            if kind == "let":
                t = let_type(lit, use, dest)
                fh.write(program(*cell, ann=t))
            else:
                fh.write(substituted(*cell))
        got = run(a.compiler, path)
        want = run(a.compiler, rule)
        before = run(a.before, path) if a.before else None
        ok = got[0] == want[0] and (got[0] != "runs" or got[1].split() == want[1].split())
        return cell, name, t, want, got, before, ok

    bad = 0
    moved = []
    counts = {}
    with ThreadPoolExecutor(a.jobs) as ex:
        for cell, name, t, want, got, before, ok in ex.map(grade, cells):
            k = "runs" if want[0] == "runs" else "refuses"
            counts[(k, ok)] = counts.get((k, ok), 0) + 1
            if not ok:
                bad += 1
                print(f"WRONG {name}: rule {t or 'literal'} want {want[0]} {want[1].split()[:6]} "
                      f"got {got[0]} {got[1].split()[:6]}")
            if before is not None and (before[0], before[1].split() if before[0] == "runs" else "") != (
                    got[0], got[1].split() if got[0] == "runs" else ""):
                moved.append((name, before[0], got[0], before[1].split()[:6] if before[0] == "runs" else "",
                              got[1].split()[:6] if got[0] == "runs" else ""))
    print(f"{len(cells)} cells: runs as the rule says {counts.get(('runs', True), 0)}, "
          f"refused as the rule says {counts.get(('refuses', True), 0)}, disagree {bad}")
    if a.before:
        lost = [m for m in moved if m[1] == "runs" and m[2] != "runs"]
        changed = [m for m in moved if m[1] == "runs" and m[2] == "runs"]
        gained = [m for m in moved if m[1] != "runs" and m[2] == "runs"]
        print(f"against --before: {len(gained)} now run, {len(lost)} runs -> not-runs, "
              f"{len(changed)} run with another value")
        for m in lost + changed:
            print("  ", m)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
