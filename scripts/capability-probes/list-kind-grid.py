#!/usr/bin/env python3
"""The list-kind grid: one `matrix.py` template per (delivery family x element kind).

`docs/internals/list-kind-audit-2026-09.md` is the report this measures. A list's REP is
chosen per element kind (the i32, packed u8, i64, f32, f64, string and ref lists, plus a
nullable twin of each), and every defect in the 2026-09-23 run was one classifier missing one
kind's rung. So the grid holds the DELIVERY fixed and varies the KIND: nine element kinds x
eight families, each family a `lk-<family>-<kind>.matrix.vl` under `matrix/`.

    python3 scripts/capability-probes/list-kind-grid.py --write        # regenerate templates
    python3 scripts/capability-probes/list-kind-grid.py --run -j 6     # grade all, print table
    python3 scripts/capability-probes/list-kind-grid.py --run --only u8,f32 --family empty-join
    python3 scripts/capability-probes/list-kind-grid.py --census       # the classifier census

GRADING is `matrix.py`'s (so run.py's vocabulary): one table cell per family x kind reads
`runs/graded` then the non-runs verdicts (S silent, T trap, E emit refuses, C check refuses,
W wrong). `COMPILER TRAP` in run.py also catches a trap in the PROGRAM's own run (both print
a wasm backtrace), so read a T cell's detail before calling it a compiler trap.
Not a gate: known-red cells are listed in the audit rather than skipped, so a fix shows as a
cell turning green. Exit is non-zero on any SILENT or trap cell.
"""
import argparse, collections, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "matrix")

# kind -> (element type spelling, list-literal of two, a push element, read-two proof expr, want)
KINDS = {
    "u8": ("u8", "[200, 1]", "200", "v[0] + v[1]", "201"),
    "i32": ("i32", "[7, 1]", "7", "v[0] + v[1]", "8"),
    "i64": ("i64", "[(4000000000 as i64), (1 as i64)]", "(4000000000 as i64)", "v[0] + v[1]",
            "4000000001"),
    "f32": ("f32", "[(7.5 as f32), (1.0 as f32)]", "(7.5 as f32)", "v[0] + v[1]", "8.5"),
    "f64": ("f64", "[1.5, 1.0]", "1.5", "v[0] + v[1]", "2.5"),
    "string": ("string", '["x", "y"]', '"x"', "v[0] + v[1]", "xy"),
    "struct": ("P", "[{ x: 7 }, { x: 1 }]", "{ x: 7 }", "v[0].x + v[1].x", "8"),
    "nested": ("i32[]", "[[7], [1]]", "[7]", "v[0][0] + v[1][0]", "8"),
    "nullelem": ("i32 | null", "[7, null]", "7", "(v[0] ?? 0) + (v[1] ?? 1)", "8"),
}
# a single-element read, for the empty-then-push proofs
ONE = {"u8": "v[0]", "i32": "v[0]", "i64": "v[0]", "f32": "v[0]", "f64": "v[0]",
       "string": "v[0]", "struct": "v[0].x", "nested": "v[0][0]", "nullelem": "v[0] ?? 0"}
ONE_WANT = {"u8": "200", "i32": "7", "i64": "4000000000", "f32": "7.5", "f64": "1.5",
            "string": "x", "struct": "7", "nested": "7", "nullelem": "7"}

NO_UNION = """// @@SKIP@@
is_in_if: the value is a list, not a union - there is no arm to test it against
is_in_while: same
is_in_and: same
is_in_not: same
else_if: same
early_return_guard: same"""


def arr(el):
    return "(%s)[]" % el if "|" in el else el + "[]"


def prelude(k, extra=""):
    lines = []
    if k == "struct":
        lines.append("type P = { x: i32 }")
    lines.append("function truthy() { 1 == 1 }")
    if extra:
        lines.append(extra)
    return "\n".join(lines)


HEAD = """// List-kind audit (docs/internals/list-kind-audit-2026-09.md): %s,
// element kind `%s`. One row of a %s-by-kind grid over nine element kinds; the proof reads
// elements back, so a value built at another list rep prints a different answer or fails to
// validate. Written by `list-kind-grid.py --write`; edit that, not this file.
//
// Format: scripts/capability-probes/matrix.py, whose docstring is the spec.
"""


def plain(k):
    el, lit, _, rd, want = KINDS[k]
    a = arr(el)
    return HEAD % ("a `K[]` value delivered by name", k, "delivery") + f"""// @@PRELUDE@@
{prelude(k, f"const src: {a} = {lit}" + chr(10) + f"function mk(): {a} {{ return {lit} }}")}
// @@VALUE@@
src
// @@TYPE@@
{a}
// @@PROOF@@
print({rd})
// @@WANT@@
{want}
// @@VALUE2@@
mk()
// @@TYPE2@@
{a}
// @@PROOF2@@
print({rd})
// @@WANT2@@
{want}
{NO_UNION}
"""


def nullable(k):
    el, lit, _, rd, want = KINDS[k]
    a = arr(el)
    return HEAD % ("a non-null `K[] | null` value", k, "nullable-list") + f"""// @@PRELUDE@@
{prelude(k, f"const src: {a} | null = {lit}" + chr(10) + f"function mk(): {a} | null {{ return {lit} }}")}
// @@VALUE@@
src
// @@TYPE@@
{a} | null
// @@FALLBACK@@
null
// @@TEST@@
v != null
// @@HIT@@
print({rd})
// @@MISS@@
print("null")
// @@WANT@@
{want}
// @@VALUE2@@
mk()
// @@TYPE2@@
{a} | null
// @@PROOF2@@
if v != null {{ print({rd}) }} else {{ print("null") }}
// @@WANT2@@
{want}
"""


def joinnull(k):
    el, lit, _, rd, want = KINDS[k]
    a = arr(el)
    return HEAD % ("an if/match join of a typed `K[]` name with `null`", k, "join") + f"""// @@PRELUDE@@
{prelude(k, f"const src: {a} = {lit}" + chr(10) + "function one() { 1 }")}
// @@VALUE@@
if truthy() {{ src }} else {{ null }}
// @@TYPE@@
{a} | null
// @@FALLBACK@@
null
// @@TEST@@
v != null
// @@HIT@@
print({rd})
// @@MISS@@
print("null")
// @@WANT@@
{want}
// @@VALUE2@@
match one() {{ 1 => null, _ => src }}
// @@TYPE2@@
{a} | null
// @@PROOF2@@
if v != null {{ print({rd}) }} else {{ print("null") }}
// @@WANT2@@
null
"""


def empty(k):
    el, lit, push, rd, want = KINDS[k]
    a = arr(el)
    return HEAD % ("an empty `[]` delivered as `K[]`, then pushed", k, "empty-literal") + f"""// @@PRELUDE@@
{prelude(k)}
// @@VALUE@@
[]
// @@TYPE@@
{a}
// @@PROOF@@
const r = v
r.push({push})
print(r.length)
// @@WANT@@
1
// @@VALUE2@@
[]
// @@TYPE2@@
{a}
// @@PROOF2@@
const r2 = v
r2.push({push})
const w = r2
print({ONE[k].replace("v", "w")})
// @@WANT2@@
{ONE_WANT[k]}
{NO_UNION}
"""


def emptyjoin(k):
    el, lit, push, rd, want = KINDS[k]
    a = arr(el)
    return HEAD % ("an if-join of a typed `K[]` name with an empty `[]` arm", k, "join") + f"""// @@PRELUDE@@
{prelude(k, f"const src: {a} = {lit}" + chr(10) + "function falsy() { 1 == 2 }")}
// @@VALUE@@
if truthy() {{ src }} else {{ [] }}
// @@TYPE@@
{a}
// @@PROOF@@
print({rd})
// @@WANT@@
{want}
// @@VALUE2@@
if falsy() {{ src }} else {{ [] }}
// @@TYPE2@@
{a}
// @@PROOF2@@
const r2 = v
r2.push({push})
const w = r2
print({ONE[k].replace("v", "w")})
// @@WANT2@@
{ONE_WANT[k]}
{NO_UNION}
"""


def mapval(k):
    el, lit, _, rd, want = KINDS[k]
    a = arr(el)
    return HEAD % ("a `{[string]: K[]}` map read (`K[] | null`)", k, "map-read") + f"""// @@PRELUDE@@
{prelude(k, f"const src: {a} = {lit}" + chr(10) + f"const m: {{[string]: {a}}} = Map()" + chr(10) + 'm["k"] = src')}
// @@VALUE@@
m["k"]
// @@TYPE@@
{a} | null
// @@FALLBACK@@
null
// @@TEST@@
v != null
// @@HIT@@
print({rd})
// @@MISS@@
print("null")
// @@WANT@@
{want}
// @@VALUE2@@
m["z"] ?? src
// @@TYPE2@@
{a}
// @@PROOF2@@
print({rd})
// @@WANT2@@
{want}
"""


def nulfield(k):
    el, lit, _, rd, want = KINDS[k]
    a = arr(el)
    return HEAD % ("a `K[] | null` record field read", k, "nullable-field") + f"""// @@PRELUDE@@
{prelude(k, f"type W = {{ f: {a} | null }}" + chr(10) + f"const src: {a} | null = {lit}" + chr(10) + f"const none: {a} | null = null" + chr(10) + "const rec: W = { f: src }" + chr(10) + "function mkRec0(): W { return { f: none } }")}
// @@VALUE@@
rec.f
// @@TYPE@@
{a} | null
// @@FALLBACK@@
null
// @@TEST@@
v != null
// @@HIT@@
print({rd})
// @@MISS@@
print("null")
// @@WANT@@
{want}
// @@VALUE2@@
mkRec0().f
// @@TYPE2@@
{a} | null
// @@PROOF2@@
if v != null {{ print({rd}) }} else {{ print("null") }}
// @@WANT2@@
null
"""


def nullfirst(k):
    el, lit, _, rd, want = KINDS[k]
    a = arr(el)
    return HEAD % ("a join whose FIRST arm is `null` and whose second is a typed `K[]` name", k, "join") + f"""// @@PRELUDE@@
{prelude(k, f"const src: {a} = {lit}" + chr(10) + "function one() { 1 }" + chr(10) + "function falsy() { 1 == 2 }")}
// @@VALUE@@
if falsy() {{ null }} else {{ src }}
// @@TYPE@@
{a} | null
// @@FALLBACK@@
null
// @@TEST@@
v != null
// @@HIT@@
print({rd})
// @@MISS@@
print("null")
// @@WANT@@
{want}
// @@VALUE2@@
match one() {{ 2 => null, _ => src }}
// @@TYPE2@@
{a} | null
// @@PROOF2@@
if v != null {{ print({rd}) }} else {{ print("null") }}
// @@WANT2@@
{want}
"""




FAMS = {"plain": plain, "nullable": nullable, "join-null": joinnull,
        "null-first-join": nullfirst, "empty": empty, "empty-join": emptyjoin,
        "map-read": mapval, "nullable-field": nulfield}
AB = {"RUNS": "R", "SILENT": "S", "COMPILER TRAP": "T", "emit refuses": "E",
      "check refuses": "C", "WRONG": "W", "TIMEOUT": "O"}


LIST_KINDS = ["list", "u8list", "i64list", "f32list", "f64list", "strlist", "reflist",
              "nullist", "nulu8list", "nuli64list", "nulf32list", "nulf64list", "nulstrlist",
              "nulreflist"]


def census():
    """Every top-level function in compiler/*.vl naming a list-kind literal, and which ones.

    A literal census names CANDIDATES: a kind a function skips may be answered by an earlier
    rung or an arena read upstream, so a `-` is where to look and the grid is what decides.
    """
    import glob
    root = os.path.dirname(os.path.dirname(HERE))
    fnre = re.compile(r"^(?:export\s+)?function\s+([A-Za-z0-9_]+)")
    print("file\tfunction\tline\tnamed\t" + "\t".join(LIST_KINDS))
    for f in sorted(glob.glob(os.path.join(root, "compiler", "*.vl"))):
        cur, start, body = None, 0, []
        for i, line in enumerate(open(f, encoding="utf-8").read().split("\n") + ["function _"]):
            m = fnre.match(line)
            if m:
                if cur:
                    ks = set(re.findall(r'"([a-z0-9]+)"', "\n".join(body))) & set(LIST_KINDS)
                    if ks:
                        print("%s\t%s\t%d\t%d\t%s" % (os.path.basename(f), cur, start, len(ks),
                              "\t".join("x" if k in ks else "." for k in LIST_KINDS)))
                cur, start, body = m.group(1), i + 1, []
            body.append(line)


def write():
    for fam, fn in FAMS.items():
        for k in KINDS:
            with open(os.path.join(OUT, "lk-%s-%s.matrix.vl" % (fam, k)), "w") as fh:
                fh.write(fn(k))
    print("%d templates written" % (len(FAMS) * len(KINDS)))


def grade(path, compiler):
    """Run matrix.py on one template; return {(position, face): verdict-class}."""
    args = [sys.executable, os.path.join(HERE, "matrix.py"), path]
    if compiler:
        args += ["--compiler", compiler]
    r = subprocess.run(args, capture_output=True, text=True, timeout=3600)
    cells = {}
    for line in r.stdout.splitlines():
        m = re.match(r"^\| `([a-z_0-9]+)` \| ([a-z-]+) \| (.*) \|$", line)
        if m:
            v = m.group(3).split(":")[0].strip()
            cells[(m.group(1), m.group(2))] = "WRONG" if v.startswith("WRONG") else v
    return cells


def run(a):
    kinds = [k for k in KINDS if not a.only or k in a.only.split(",")]
    fams = [f for f in FAMS if not a.family or f in a.family.split(",")]
    jobs = [(f, k) for f in fams for k in kinds]
    paths = [os.path.join(OUT, "lk-%s-%s.matrix.vl" % j) for j in jobs]
    with ThreadPoolExecutor(a.jobs) as ex:
        res = dict(zip(jobs, ex.map(lambda p: grade(p, a.compiler), paths)))
    bad = 0
    print("| family | " + " | ".join(kinds) + " |")
    print("| --- |" + " --- |" * len(kinds))
    for f in fams:
        row = []
        for k in kinds:
            c = collections.Counter(v for v in res[(f, k)].values() if v != "skipped")
            bad += c["SILENT"] + c["COMPILER TRAP"]
            rest = " ".join("%d%s" % (n, AB.get(v, "?")) for v, n in sorted(c.items())
                            if v != "RUNS")
            row.append(("%d/%d %s" % (c["RUNS"], sum(c.values()), rest)).strip())
        print("| %s | %s |" % (f, " | ".join(row)))
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="regenerate the templates")
    ap.add_argument("--run", action="store_true", help="grade every template")
    ap.add_argument("--census", action="store_true", help="list-kind literals per function")
    ap.add_argument("--only", default="", help="comma-separated element kinds")
    ap.add_argument("--family", default="", help="comma-separated families")
    ap.add_argument("--compiler", default="", help="seed (default: matrix.py's)")
    ap.add_argument("-j", "--jobs", type=int, default=4)
    a = ap.parse_args()
    if a.census:
        census()
        return 0
    if a.write:
        write()
    if a.run:
        return run(a)
    if not a.write:
        ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
