#!/usr/bin/env python3
"""adoption-grid.py OUTDIR SEED : adoption uses (DECISIONS.md "Record covariance"). A fresh binding (a record or a list of records) is
delivered once to a wider declared record, then used once more; every program prints."""
import os, sys, json, subprocess
from concurrent.futures import ThreadPoolExecutor
W = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = W + "/scripts/vl-host/target/release/vl"

PAIRS = {
    "null": ("{ f: i32 | null }", "print(X.f ?? 0)"),
    "i64": ("{ f: i64 }", "print(X.f)"),
    "f64": ("{ f: f64 }", "print(X.f)"),
    "str": ("{ f: i32 | string }", "if X.f is i32 { print(X.f) } else { print(0) }"),
}
# record binding uses; S is the binding
REC_USES = {
    "read": "print(S.f)",
    "arith": "print(S.f + 1)",
    "div": "print(S.f / 2)",
    "own_arg": "function own(r: { f: i32 }) { print(r.f) }\nown(S)",
    "alias": "const t = S\nprint(t.f)",
    "in_obj": "const o = { r: S }\nprint(o.r.f)",
    "in_list": "const l = [S]\nprint(l[0].f)",
    "ret": "function g() { return S }\nprint(g().f)",
    "second_j": "take(S)",
    "write_own": "S.f = 9\nprint(S.f)",
    "eq": "print(S == S)",
}
LIST_USES = {
    "read": "print(S[0].f)",
    "arith": "print(S[0].f + 1)",
    "map": "const z = S.map((e) => e.f)\nprint(z[0])",
    "filter": "const z = S.filter((e) => e.f > 0)\nprint(z.length)",
    "for": "for e in S { print(e.f) }",
    "spread": "const cp = [...S]\nprint(cp.length)",
    "push_lit": "S.push({ f: 5 })\nprint(S.length)",
    "own_arg": "function own(r: { f: i32 }[]) { print(r.length) }\nown(S)",
    "elem_own": "function own(r: { f: i32 }) { print(r.f) }\nown(S[0])",
    "in_obj": "const o = { xs: S }\nprint(o.xs.length)",
    "len": "print(S.length)",
}


def prog(pair, kind, use):
    jt, rd = PAIRS[pair]
    head = f"type J = {jt}\nfunction take(j: J) {{ {rd.replace('X', 'j')} }}\n"
    if kind == "rec":
        return head + "const s = { f: 4 }\ntake(s)\n" + REC_USES[use].replace("S", "s") + "\n"
    return head + "const il = [{ f: 4 }]\nconst ic: J[] = il\ntake(ic[0])\n" + LIST_USES[use].replace("S", "il") + "\n"


def run(args):
    path, seed = args
    env = dict(os.environ, VL_STD=W + "/std")
    c = subprocess.run(["timeout", "60", VL, "check", "--compiler", seed, path], capture_output=True, text=True, env=env)
    if c.returncode != 0:
        m = [l for l in (c.stdout + c.stderr).split("\n") if "ERROR" in l]
        return "CHECK", (m[0] if m else "")[:160]
    r = subprocess.run(["timeout", "60", VL, "run", "--compiler", seed, path], capture_output=True, text=True, env=env)
    out = (r.stdout + r.stderr).strip()
    if r.returncode == 0:
        return "RUNS", out.replace("\n", "|")[:100]
    low = out.lower()
    if "invalid module" in low:
        return "SILENT", out.replace("\n", "|")[:160]
    if "emit error" in low:
        return "EMIT", out.replace("\n", "|")[:160]
    return "TRAP", out.replace("\n", "|")[:160]


def main():
    out, seed = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    cells = []
    for pair in PAIRS:
        for kind, uses in (("rec", REC_USES), ("list", LIST_USES)):
            for use in uses:
                name = f"{pair}__{kind}__{use}"
                p = os.path.join(out, name + ".vl")
                open(p, "w").write(prog(pair, kind, use))
                cells.append((name, p))
    with ThreadPoolExecutor(int(os.environ.get("JOBS", "4"))) as ex:
        res = list(ex.map(run, [(p, seed) for _, p in cells]))
    rows = [{"cell": n, "fresh": True, "grade": g, "msg": m} for (n, _), (g, m) in zip(cells, res)]
    json.dump(rows, open(os.path.join(out, "grades.json"), "w"))
    for r in rows:
        print(f"{r['grade']:7} {r['cell']}  {r['msg']}")


main()
