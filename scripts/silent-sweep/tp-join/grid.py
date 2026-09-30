#!/usr/bin/env python3
"""A join of two or three parameters, at every pin pair: the grid lane JW graded D3266, D3267,
D3268, D3280, D3284, D3291 and D3332 on, and filed D3333, D3334 and D3335 from.

Axes: pins (`i32`, `boolean`, `K`, `string`, a record `P`, `null`, `i32 | null`, `K | null`) for
every pair and 40 seeded triples; the join (`if` chain or `match`) with no extra arm or a `null`,
`5` or `"z"` arm; the delivery (returned then bound, returned into `print`, passed to a generic
`show<U>`, bound, a record field); the reader (`print`, `is` per member class, a `match` per
member class); the spelling (`<T0, T1>`, un-annotated holes, the direct concrete twin). Every
cell's expected output is computed here, from the arm each selector picks, so a cell grades
`right` or `WRONG` on its own, and `INVALID` / `RTRAP` / `CRASH` / `check` / `emit` otherwise.

    python3 scripts/silent-sweep/tp-join/grid.py gen /tmp/tpj
    python3 scripts/silent-sweep/tp-join/grid.py run /tmp/tpj build/vl-compiler.wasm new [JOBS]
    python3 scripts/silent-sweep/tp-join/grid.py cmp /tmp/tpj old new
    python3 scripts/silent-sweep/tp-join/grid.py list /tmp/tpj new tp
"""
import itertools
import json
import os
import random
import subprocess
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
VL = os.path.join(ROOT, "scripts", "vl-host", "target", "release", "vl")

# pin -> (annotation, three values as (source, class, printed)); value i goes to parameter i
PINS = {
    "i": ("i32", [("3", "i32", "3"), ("4", "i32", "4"), ("6", "i32", "6")]),
    "b": ("boolean", [("true", "boolean", "true"), ("false", "boolean", "false"),
                      ("true", "boolean", "true")]),
    "k": ("K", [('"a"', "K", "a"), ('"b"', "K", "b"), ('"a"', "K", "a")]),
    "s": ("string", [('"x"', "string", "x"), ('"y"', "string", "y"), ('"w"', "string", "w")]),
    "p": ("P", [("{x: 11}", "P", "11"), ("{x: 12}", "P", "12"), ("{x: 13}", "P", "13")]),
    "n": ("null", [("null", "null", "null")] * 3),
    "in": ("i32 | null", [("7", "i32", "7"), ("null", "null", "null"), ("8", "i32", "8")]),
    "kn": ("K | null", [('"b"', "K", "b"), ("null", "null", "null"), ('"a"', "K", "a")]),
}
# a pin's member classes, which the `is` and `match` readers enumerate
CLASSES = {"i": ["i32"], "b": ["boolean"], "k": ["K"], "s": ["string"], "p": ["P"],
           "n": ["null"], "in": ["i32", "null"], "kn": ["K", "null"]}
EXTRA = {"none": None, "null": ("null", "null", "null"), "lit": ("5", "i32", "5"),
         "str": ('"z"', "string", "z")}
JOINS = ["chain", "match"]
DELIVS = ["ret", "retp", "arg", "bind", "field"]
READERS = ["print", "is", "match"]
SPELL = ["tp", "hole", "dir"]
CLAUSE1 = ("INVALID", "WRONG", "RTRAP", "CRASH")


def is_true(c, m):
    return c == m or (m == "string" and c == "K")


def join_src(n, jform, extra):
    arms = [f"a{i}" for i in range(n)]
    if extra != "none":
        arms.append(EXTRA[extra][0])
    if jform == "chain":
        s = f"if k == 0 {{ {arms[0]} }}"
        for i in range(1, len(arms) - 1):
            s += f" else if k == {i} {{ {arms[i]} }}"
        return s + f" else {{ {arms[-1]} }}", len(arms)
    lines = [f"    {i} => {arms[i]}" for i in range(len(arms) - 1)]
    lines.append(f"    _ => {arms[-1]}")
    return "match k {\n" + "\n".join(lines) + "\n  }", len(arms)


def cell(pins, jform, extra, deliv, reader, spell):
    n = len(pins)
    uniq = []
    for c in [c for p in pins for c in CLASSES[p]] + ([EXTRA[extra][1]] if extra != "none" else []):
        if c not in uniq:
            uniq.append(c)
    # `print` refuses a record; `match` over a literal union is refused by design.
    if reader == "print" and "P" in uniq:
        return None
    if reader == "match" and "K" in uniq:
        return None
    if deliv == "retp" and reader != "print":
        return None
    js, narms = join_src(n, jform, extra)
    vals = [PINS[p][1][i] for i, p in enumerate(pins)]
    if extra != "none":
        vals.append(EXTRA[extra])
    want = []
    for sel in range(narms):
        _, c, printed = vals[sel]
        if reader == "print":
            want.append(printed)
        elif reader == "is":
            want += ["true" if is_true(c, m) else "false" for m in uniq]
        else:
            want.append(c)

    def rd(e):
        if reader == "print":
            return [f"print({e})"]
        if reader == "is":
            return [f"print({e} is {m})" for m in uniq]
        arms = "\n".join(f'    {m} => "{m}"' for m in uniq)
        return [f"print(match {e} {{\n{arms}\n  }})"]

    src = ['type K = "a" | "b"', "type P = {x: i32}"]
    if deliv == "arg":
        src.append("function show<U>(v: U) {")
        src += ["  " + l for l in rd("v")]
        src.append("}")

    def ann(i):
        if spell == "tp":
            return f": T{i}"
        if spell == "dir":
            return f": {PINS[pins[i]][0]}"
        return ""

    params = ", ".join(f"a{i}{ann(i)}" for i in range(n))
    tps = "<" + ", ".join(f"T{i}" for i in range(n)) + ">" if spell == "tp" else ""
    src.append(f"function g{tps}({params}, k: i32) {{")
    if deliv in ("ret", "retp"):
        src += [f"  const r = {js}", "  return r"]
    elif deliv == "arg":
        src.append(f"  show({js})")
    elif deliv == "bind":
        src.append(f"  const r = {js}")
        src += ["  " + l for l in rd("r")]
    else:
        src.append(f"  const o = {{ v: {js} }}")
        src += ["  " + l for l in rd("o.v")]
    src.append("}")
    for i, p in enumerate(pins):
        src.append(f"const x{i}: {PINS[p][0]} = {PINS[p][1][i][0]}")
    args = ", ".join(f"x{i}" for i in range(n))
    for sel in range(narms):
        if deliv == "ret":
            src.append(f"const v{sel} = g({args}, {sel})")
            src += rd(f"v{sel}")
        elif deliv == "retp":
            src.append(f"print(g({args}, {sel}))")
        else:
            src.append(f"g({args}, {sel})")
    name = "__".join(["-".join(pins), jform, extra, deliv, reader, spell])
    return name, "\n".join(src) + "\n", want


def gen(out, n3):
    os.makedirs(out + "/cells", exist_ok=True)
    tuples = list(itertools.product(PINS, repeat=2))
    tuples += random.Random(3266).sample(list(itertools.product(PINS, repeat=3)), n3)
    exp = {}
    for pins in tuples:
        for jf, ex, dv, rd, sp in itertools.product(JOINS, EXTRA, DELIVS, READERS, SPELL):
            c = cell(pins, jf, ex, dv, rd, sp)
            if c is None:
                continue
            name, src, want = c
            with open(f"{out}/cells/{name}.vl", "w") as f:
                f.write(src)
            exp[name] = want
    with open(out + "/expected.json", "w") as f:
        json.dump(exp, f)
    print(len(exp), "cells")


def run(out, seed, tag, jobs, chunk=150):
    names = sorted(json.load(open(out + "/expected.json")))
    od = f"{out}/{tag}"
    os.makedirs(od, exist_ok=True)
    env = dict(os.environ, VL_STD=os.path.join(ROOT, "std"))

    def one(ch):
        subprocess.run([VL, "run", "--batch", "--out-dir", od, "--compiler", seed]
                       + [f"{out}/cells/{n}.vl" for n in ch], env=env, capture_output=True,
                       timeout=3000)

    with ThreadPoolExecutor(jobs) as ex:
        list(ex.map(one, [names[i:i + chunk] for i in range(0, len(names), chunk)]))
    res = {}
    for n in names:
        o = f"{od}/{n}.vl.out"
        e = f"{od}/{n}.vl.err"
        res[n] = {"out": open(o).read() if os.path.exists(o) else "",
                  "err": open(e).read() if os.path.exists(e) else ""}
    with open(f"{out}/{tag}.json", "w") as f:
        json.dump(res, f)


def grade(want, r):
    e = r["err"]
    if e:
        if "failed to validate" in e or "Invalid input WebAssembly" in e:
            return "INVALID"
        if e.startswith("type error"):
            return "check"
        if e.startswith("emit error"):
            return "emit"
        if "<unknown>!<wasm function" in e:
            return "CRASH"
        return "RTRAP"
    return "right" if r["out"].strip().splitlines() == want else "WRONG"


def cmp(out, tag, tag2):
    exp = json.load(open(out + "/expected.json"))
    a = json.load(open(f"{out}/{tag}.json"))
    print(tag, dict(Counter(grade(exp[n], a[n]) for n in exp)))
    if tag2:
        b = json.load(open(f"{out}/{tag2}.json"))
        print(tag2, dict(Counter(grade(exp[n], b[n]) for n in exp)))
        mv = Counter((grade(exp[n], a[n]), grade(exp[n], b[n])) for n in exp)
        for (ga, gb), v in sorted(mv.items(), key=lambda x: -x[1]):
            if ga != gb:
                print(f"  {ga:8s} -> {gb:8s} {v}")
        lost = [n for n in exp if grade(exp[n], a[n]) == "right" and grade(exp[n], b[n]) != "right"]
        print("right lost:", len(lost))
        for n in lost:
            print("  ", n, grade(exp[n], b[n]))
    for sp in SPELL:
        c1 = sum(1 for n in exp if n.endswith("__" + sp)
                 and grade(exp[n], (b if tag2 else a)[n]) in CLAUSE1)
        print(f"clause 1 at {sp}: {c1}")


def listc1(out, tag, sp):
    exp = json.load(open(out + "/expected.json"))
    r = json.load(open(f"{out}/{tag}.json"))
    for n in sorted(exp):
        if not n.endswith("__" + sp) or grade(exp[n], r[n]) not in CLAUSE1:
            continue
        b = n[: -len(sp) - 2]
        tw = " ".join(f"{s}:{grade(exp[b + '__' + s], r[b + '__' + s])}" for s in SPELL)
        print(f"{grade(exp[n], r[n]):7s} {b:42s} {tw}")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "gen":
        gen(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 40)
    elif cmd == "run":
        run(sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]) if len(sys.argv) > 5 else 2)
    elif cmd == "cmp":
        cmp(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    else:
        listc1(sys.argv[2], sys.argv[3], sys.argv[4])
