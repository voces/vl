#!/usr/bin/env python3
"""The written-binding grid for function values (D3960; owner ruling C, 2026-10-10).

    python3 scripts/capability-probes/generic-let-written-grid.py [--compiler W] [--before W]
        [--jobs N] [--list] [--keep DIR]

One program per cell of initialiser (generic / alias of a generic / hole lambda / concrete /
generic under a concrete annotation) x write (none / concrete matching the call / concrete
not matching / another generic) x call type (i32 / boolean / string / both i32 and boolean)
x scope (module / function / generic body) x position (direct / write in a closure /
call before and after the write), plus hand-written probes for shadowing, delivery and
module-scope writes. Each program prints values that tell the instances apart.

The oracle is ruling C: a binding takes its type from its initialiser and keeps it. A `let`
seeded with a generic or a hole lambda stays generic, so a concrete write into it is a check
error and calls at any type are legal; a concretely typed binding accepts a matching
function or a generic, and nothing else. `ILL` cells must be refused by `vl check`.

Exits non-zero on any SILENT cell (a legal program that traps, fails to validate or prints
the wrong value, or an illegal one that runs). Loud refusals of legal cells are clause-2
gaps: printed and counted, not failed. `--before` grades an older compiler too and lists
every cell whose outcome moved.
"""

import argparse
import collections
import itertools
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = os.path.join(ROOT, "scripts", "vl-host", "target", "release", "vl")

PRE = """function inner<U>(u: U) { print("I"); print(u) }
function gen2<V>(v: V) { print("G"); print(v) }
function cI32(n: i32) { print("C"); print(n + 100) }
function cBool(n: boolean) { print("B"); print(!n) }
function cStr(n: string) { print("S"); print(n + "!") }
"""
VAL = {"i32": "7", "bool": "true", "str": '"s"'}
CFN = {"i32": "cI32", "bool": "cBool", "str": "cStr"}
CALLS = {"i32": ["i32"], "bool": ["bool"], "str": ["str"], "pair": ["i32", "bool"]}
INITS = {
    "gen": "inner",
    "alias": "ali",
    "hole": '(u) => { print("I"); print(u) }',
    "conc": "cI32",
    "ann": "inner",
}


def show(fn, t):
    """What `fn` prints when called with VAL[t]."""
    v = {"i32": "7", "bool": "true", "str": "s"}[t]
    return {
        "inner": ["I", v],
        "hole": ["I", v],
        "gen2": ["G", v],
        "cI32": ["C", "107"],
        "cBool": ["B", "false"],
        "cStr": ["S", "s!"],
    }[fn]


def ptype(fn):
    return {"cI32": "i32", "cBool": "bool", "cStr": "str"}.get(fn)


def legal(init, wfn, cts):
    """Ruling C: the binding's type is its initialiser's, for good."""
    if init in ("gen", "alias", "hole"):
        return wfn is None or ptype(wfn) is None
    # `conc` and `ann` are `(n: i32) => void`: a generic write is instanced there.
    if wfn is not None and ptype(wfn) not in (None, "i32"):
        return False
    return all(t == "i32" for t in cts)


def matrix_cells():
    for init, wr, call, scope, pos in itertools.product(
        INITS, ["none", "match", "mismatch", "generic"], CALLS, ["mod", "fn", "gen"],
        ["direct", "closure", "mutread"],
    ):
        cts = CALLS[call]
        if wr == "none" and pos != "direct":
            continue
        if scope == "gen" and call == "pair":
            continue  # one T per instance
        wfn = {
            "none": None,
            "match": CFN[cts[0]],
            "mismatch": "cStr" if cts[0] != "str" else "cBool",
            "generic": "gen2",
        }[wr]
        cur = {"gen": "inner", "alias": "inner", "hole": "hole", "conc": "cI32", "ann": "inner"}[init]
        body, want = [], []
        if init == "alias":
            body.append("const ali = inner")
        ann = ": (n: i32) => void" if init == "ann" else ""
        body.append(f"let k{ann} = {INITS[init]}")
        calls = [f"k({VAL[t]})" if scope != "gen" else "k(x)" for t in cts]
        if pos == "mutread":
            for t, c in zip(cts, calls):
                body.append(c)
                want += show(cur, t)
        if wfn:
            if pos == "closure":
                body += [f"const wr = () => {{ k = {wfn} }}", "wr()"]
            else:
                body.append(f"k = {wfn}")
            cur = wfn
        for t, c in zip(cts, calls):
            body.append(c)
            want += show(cur, t)
        if scope == "mod":
            src = PRE + "\n".join(body) + "\n"
        elif scope == "fn":
            src = PRE + "function main() {\n" + "".join(f"  {b}\n" for b in body) + "}\nmain()\n"
        else:
            src = (PRE + "function g<T>(x: T) {\n" + "".join(f"  {b}\n" for b in body) + "}\n"
                   + f"g({VAL[cts[0]]})\n")
        yield f"{init}_{wr}_{call}_{scope}_{pos}", src, (want if legal(init, wfn, cts) else None)


def fn_main(*lines, decls=""):
    return PRE + decls + "function main() {\n" + "".join(f"  {s}\n" for s in lines) + "}\nmain()\n"


H = "function h(k: (n: boolean) => void) { k(true) }\n"
ANN = "let k: (n: i32) => void = inner"
PROBES = {
    # Ruling C refuses the concrete write in each of these; the `_ann` twin is the fix-it
    # spelling, which keeps what the probe was written to test.
    "shadow_param": (
        fn_main("let k = inner", "k = cI32", "k(7)", "h(cBool)",
                  'const lam = (k: (s: string) => void) => k("s")', "lam(cStr)", decls=H),
        None,
    ),
    "shadow_param_ann": (
        fn_main(ANN, "k = cI32", "k(7)", "h(cBool)",
                  'const lam = (k: (s: string) => void) => k("s")', "lam(cStr)", decls=H),
        "C 107 B false S s!",
    ),
    "shadow_inner_let": (
        fn_main("let k = inner", "k = cI32", "if true {", "  let k = inner", "  k(true)", "}", "k(7)"),
        None,
    ),
    "shadow_inner_let_ann": (
        fn_main(ANN, "k = cI32", "if true {", "  let k = inner", "  k(true)", "}", "k(7)"),
        "I true C 107",
    ),
    "deliver_after_write": (
        fn_main("let k = inner", "k = cI32", "const g: (b: boolean) => void = k", "g(true)"), None),
    "deliver_before_write_closure": (
        fn_main("let k = inner", "const w = () => { const g: (b: boolean) => void = k; g(true) }",
                "k = cI32", "w()"),
        None,
    ),
    "call_in_closure_before_write": (
        fn_main("let k = inner", "const w = () => { k(true) }", "k = cI32", "w()"), None),
    "deliver_match": (
        fn_main("let k = inner", "k = cI32", "const g: (n: i32) => void = k", "g(7)"), None),
    "deliver_match_ann": (
        fn_main(ANN, "k = cI32", "const g: (n: i32) => void = k", "g(7)"), "C 107"),
    "unwritten_poly": (fn_main("let k = inner", "k(7)", "k(true)"), "I 7 I true"),
    "two_concrete_writes": (fn_main("let k = inner", "k = cI32", "k = cBool", "k(true)"), None),
    "concrete_then_generic_write": (
        fn_main("let k = inner", "k = cI32", "k = gen2", "k(7)"), None),
    "concrete_then_generic_write_ann": (fn_main(ANN, "k = cI32", "k = gen2", "k(7)"), "G 7"),
    "generic_write_two_types": (
        fn_main("let k = inner", "k = gen2", "k(7)", "k(true)"), "G 7 G true"),
    "module_written_in_fn": (
        PRE + "let k = inner\nfunction setk() { k = cI32 }\n"
        "function main() {\n  setk()\n  k(true)\n}\nmain()\n",
        None,
    ),
    "module_written_in_fn_ok": (
        PRE + "let k = inner\nfunction setk() { k = cI32 }\n"
        "function main() {\n  setk()\n  k(7)\n}\nmain()\n",
        None,
    ),
    "module_written_in_fn_ann": (
        PRE + f"{ANN}\nfunction setk() {{ k = cI32 }}\n"
        "function main() {\n  setk()\n  k(7)\n}\nmain()\n",
        "C 107",
    ),
}


def all_cells():
    yield from matrix_cells()
    for name, (src, want) in PROBES.items():
        yield f"p_{name}", src, (want.split() if want is not None else None)


def grade(compiler, path, want):
    p = subprocess.run(["timeout", "60", VL, "run", path, "--compiler", compiler],
                       capture_output=True, text=True)
    e = p.stderr + p.stdout
    if p.returncode == 0:
        if want is None:
            return "SILENT-illtyped-ran"
        return "runs" if p.stdout.split() == want else "SILENT-wrong"
    if "invalid module" in e:
        return "SILENT-invalid"
    if "wasm trap" in e:
        return "SILENT-trap"
    if "type error" in e:
        return "loud-check" if want is None else "loud-check(clause2)"
    if "emit error" in e:
        return "loud-emit(clause2)" if want is not None else "loud-emit(checker owed)"
    return f"other:{p.returncode}"


def run_all(compiler, cells, d, jobs):
    with ThreadPoolExecutor(jobs) as ex:
        return list(ex.map(lambda c: grade(compiler, os.path.join(d, c[0] + ".vl"), c[2]), cells))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--compiler", default=os.path.join(ROOT, "build", "vl-compiler.wasm"))
    ap.add_argument("--before")
    ap.add_argument("--jobs", type=int, default=int(os.environ.get("JOBS", "4")))
    ap.add_argument("--list", action="store_true", help="print every cell's outcome")
    ap.add_argument("--keep", help="write the programs here and keep them")
    a = ap.parse_args()
    cells = list(all_cells())
    d = a.keep or tempfile.mkdtemp(prefix="glw-grid-")
    os.makedirs(d, exist_ok=True)
    for name, src, _ in cells:
        with open(os.path.join(d, name + ".vl"), "w") as f:
            f.write(src)
    try:
        after = run_all(a.compiler, cells, d, a.jobs)
        before = run_all(a.before, cells, d, a.jobs) if a.before else None
    finally:
        if not a.keep:
            shutil.rmtree(d)
    print(f"{len(cells)} cells, {sum(c[2] is None for c in cells)} ill-typed by ruling C")
    print("after: ", dict(sorted(collections.Counter(after).items())))
    if before:
        print("before:", dict(sorted(collections.Counter(before).items())))
        for (name, _, _), b, x in zip(cells, before, after):
            if b != x:
                print(f"  moved {name}: {b} -> {x}")
    if a.list:
        for (name, _, _), x in zip(cells, after):
            print(f"{name} {x}")
    silent = [c[0] for c, x in zip(cells, after) if x.startswith("SILENT")]
    print(f"{len(silent)} SILENT")
    return 1 if silent else 0


if __name__ == "__main__":
    sys.exit(main())
