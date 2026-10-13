#!/usr/bin/env python3
"""The record-covariance position grid (DECISIONS.md "Record covariance: only a fresh value
widens"): field-storage pairs x fresh and existing sources x delivery positions.

usage: position-grid.py OUTDIR [SEED] [--only substr[,substr]]
Writes one program per cell and grades it: RUNS(ok)/WRONG/CHECK/EMIT/SILENT/TRAP.
Each program prints a value that proves the delivery (the destination read) and the
source read after the delivery.
"""
import os, subprocess, sys, json
from concurrent.futures import ThreadPoolExecutor

W = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = W + "/scripts/vl-host/target/release/vl"

# pair: (prelude, I fields, J fields, source literal, read of a J value `x` -> prints, want)
PAIRS = {
    "i32_null": ("", "{ f: i32 }", "{ f: i32 | null }", "{ f: 4 }", "print(X.f ?? 0)", "4"),
    "i32_i64": ("", "{ f: i32 }", "{ f: i64 }", "{ f: 4 }", "print(X.f)", "4"),
    "i32_f64": ("", "{ f: i32 }", "{ f: f64 }", "{ f: 3 }", "print(X.f / 2.0)", "1.5"),
    "obj_null": ("type O = { v: i32 }\n", "{ f: O }", "{ f: O | null }", "{ f: { v: 4 } }", "print(X.f?.v ?? 0)", "4"),
    "i32_str": ("", "{ f: i32 }", "{ f: i32 | string }", "{ f: 4 }", "if X.f is i32 { print(X.f) } else { print(0) }", "4"),
    "nested": ("type A = { v: i32 }\ntype B = { v: i32 | null }\n", "{ r: A }", "{ r: B }", "{ r: { v: 4 } }", "print(X.r.v ?? 0)", "4"),
    "str_null": ("", "{ f: string }", "{ f: string | null }", '{ f: "4" }', 'print(X.f ?? "z")', "4"),
    "ro_list": ("", "{ f: i32[] }", "{ f: readonly i32[] }", "{ f: [4] }", "print(X.f[0])", "4"),
    "lit_num": ("", "{ f: 4 | 5 }", "{ f: i32 }", "{ f: 4 }", "print(X.f)", "4"),
    "lit_str": ("type K = \"4\" | \"b\"\n", "{ f: K }", "{ f: string }", '{ f: "4" }', "print(X.f)", "4"),
    "rec_union": ("type C = { r: i32 }\ntype Sq = { s: i32 }\n", "{ f: C }", "{ f: C | Sq }", "{ f: { r: 4 } }", "if X.f is C { print(X.f.r) } else { print(0) }", "4"),
    "width_nested": ("type A = { v: i32, w: i32 }\ntype B = { v: i32 }\n", "{ r: A }", "{ r: B }", "{ r: { v: 4, w: 1 } }", "print(X.r.v)", "4"),
    "same": ("", "{ f: i32 }", "{ f: i32 }", "{ f: 4 }", "print(X.f)", "4"),
}

# position templates. SRC is the source expression (fresh or not), J the dest type.
# Each defines the program BODY after prelude + types; it must print the J-read then "i".
POS = {
    "binding": "const x: J = SRC\nREAD",
    "argument": "function k(x: J) { READ }\nk(SRC)",
    "return": "function k(): J { SRC }\nconst x = k()\nREAD",
    "assign": "let x: J = FRESHJ\nx = SRC\nREAD",
    "field": "type H = { h: J }\nconst hh: H = { h: SRC }\nconst x = hh.h\nREAD",
    "fieldstore": "type H = { h: J }\nconst hh: H = { h: FRESHJ }\nhh.h = SRC\nconst x = hh.h\nREAD",
    "element": "const xs: J[] = [SRC]\nconst x = xs[0]\nREAD",
    "elemstore": "const xs: J[] = [FRESHJ]\nxs[0] = SRC\nconst x = xs[0]\nREAD",
    "push": "const xs: J[] = []\nxs.push(SRC)\nconst x = xs[0]\nREAD",
    "generic": "function id<T>(v: T): T { v }\nconst x: J = id(SRC)\nREAD",
    "closure": "const g = (x: J) => { READ }\ng(SRC)",
    "join": "const x: J = if true { SRC } else { FRESHJ }\nREAD",
}

# source spellings: fresh ones are built at the destination; others are existing records.
SRCS = {
    "lit": ("", "LIT", True),
    "unannot_bind": ("const s = LIT\n", "s", True),
    "annot_bind": ("const s: I = LIT\n", "s", False),
    "call": ("function mk(): I { LIT }\n", "mk()", False),
    "field_of": ("type Hs = { hs: I }\nconst hs: Hs = { hs: LIT }\n", "hs.hs", False),
    "unannot_call": ("function mk() { const s: I = LIT\n s }\n", "mk()", False),
}


def prog(pair, pos, src):
    pre, ifs, jfs, lit, read, want = PAIRS[pair]
    spre, sexpr, fresh = SRCS[src]
    freshj = lit.replace("4", "9").replace("3", "9")
    body = POS[pos]
    body = body.replace("READ", read.replace("X", "x"))
    body = body.replace("SRC", sexpr).replace("FRESHJ", freshj)
    spre = spre.replace("LIT", lit)
    body = body.replace("LIT", lit)
    return pre + "type I = " + ifs + "\ntype J = " + jfs + "\n" + spre + body + "\n", want, fresh


def run(args):
    path, seed, want = args
    env = dict(os.environ, VL_STD=W + "/std")
    c = subprocess.run(["timeout", "60", VL, "check", "--compiler", seed, path], capture_output=True, text=True, env=env)
    if c.returncode != 0:
        msg = (c.stdout + c.stderr).strip().splitlines()
        m = next((l for l in msg if "error" in l.lower()), msg[0] if msg else "")
        return "CHECK", m[:200]
    r = subprocess.run(["timeout", "60", VL, "run", "--compiler", seed, path], capture_output=True, text=True, env=env)
    out = (r.stdout + r.stderr).strip()
    if r.returncode == 0:
        first = out.splitlines()[0] if out else ""
        return ("RUNS" if first == want else "WRONG"), out.replace("\n", "|")[:120]
    low = out.lower()
    if "invalid module" in low or "type mismatch" in low or "validat" in low:
        return "SILENT", out.replace("\n", "|")[:200]
    if "trap" in low or "unreachable" in low or "out of bounds" in low:
        return "TRAP", out.replace("\n", "|")[:200]
    return "EMIT", out.replace("\n", "|")[:200]


def main():
    out = sys.argv[1]
    seed = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else W + "/build/vl-compiler.wasm"
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    jobs = int(os.environ.get("JOBS", "2"))
    os.makedirs(out, exist_ok=True)
    cells = []
    for pair in PAIRS:
        for pos in POS:
            for src in SRCS:
                name = f"{pair}__{pos}__{src}"
                if only and not all(o in name for o in only.split(",")):
                    continue
                text, want, fresh = prog(pair, pos, src)
                p = os.path.join(out, name + ".vl")
                open(p, "w").write(text)
                cells.append((name, p, want, fresh))
    with ThreadPoolExecutor(jobs) as ex:
        res = list(ex.map(run, [(p, seed, w) for (_, p, w, _) in cells]))
    rows = []
    for (name, p, want, fresh), (g, m) in zip(cells, res):
        rows.append({"cell": name, "fresh": fresh, "grade": g, "msg": m})
        print(f"{g:7} {'F' if fresh else 'N'} {name}  {m}")
    json.dump(rows, open(os.path.join(out, "grades.json"), "w"), indent=0)
    from collections import Counter
    print(Counter((r["grade"], r["fresh"]) for r in rows))


main()
