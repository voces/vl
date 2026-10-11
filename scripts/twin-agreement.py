#!/usr/bin/env python3
"""Grades a type-taking TWIN against the render-then-parse call it replaces, on every arena row.

The emitter used to answer a rep question by rendering a type (`tyToEmitName`) and parsing
the spelling back; lane L2 replaces those calls with twins that read the type itself. A twin
is only a refactor if it agrees with the original on EVERY type the arena can hold, and the
corpus cannot show that: #3540's first `valueAtomKindOfTy` disagreed on a literal and on a
literal union, which no corpus cell reached at that site.

So this compares the two over the WHOLE arena, not at the call site. It patches a copy of
`compiler/`, so that at the top of `emitProgram` every row of `T.tys` is asked both
questions; builds that probe compiler from `--seed`; then compiles one program per type kind
(`KINDS` below, each type placed as a binding, a field, a nullable field, a param, a return,
a list element, a union member and a generic hole) plus any `--list` programs. The probe
always refuses with `TWINSWEEP rows=<n>` and the disagreeing renders, so a program that
printed no row count never reached the emitter and is reported as UNREACHED, not as clean.

  python3 scripts/twin-agreement.py                      # every twin, the kind grid
  python3 scripts/twin-agreement.py --twins vak --list my-programs.txt

Exits non-zero on a disagreement or an unreached kind program. Run from the checkout root;
the probe build takes about a minute.
"""
import argparse
import collections
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent

# name -> (file the sweep is appended to, VL statements comparing twin and original for row
# `i` whose render is `nm`; each appends " [<name> <render> twin=… orig=…]" to `out`).
TWINS = {
    "vak": ("emit_classify.vl", '''    const vak1 = valueAtomKindOfTy(i)
    const vak2 = valueAtomKind(nm)
    if vak1 != vak2 {
      out = out + " [vak " + nm + " twin=" + i32ToStr(vak1) + " orig=" + i32ToStr(vak2) + "]"
    }'''),
}

# A prelude, a type, and a value of it. Every kind must reach the emitter: a kind the checker
# refuses compares nothing, which is why the grid has no float literal or boolean literal
# type (not types) and no `u8` (storage only).
KINDS = {
    "i32": ("", "i32", "3"), "i64": ("", "i64", "3"), "f32": ("", "f32", "1.5"),
    "f64": ("", "f64", "1.5"), "bool": ("", "boolean", "true"), "str": ("", "string", '"s"'),
    "lit_int": ("", "7", "7"), "lit_str": ("", '"a"', '"a"'),
    "lu_int": ("", "0 | 1", "1"), "lu_str": ("", '"a" | "b"', '"a"'),
    "lu_mixed": ("", '1 | "a"', "1"),
    "alias_lu": ("type K = 0 | 1\n", "K", "1"),
    "alias_alias": ("type K = 0 | 1\ntype K2 = K\n", "K2", "1"),
    "alias_str_lu": ('type S = "a" | "b"\n', "S", '"a"'),
    "nul_i32": ("", "i32 | null", "3"), "nul_f64": ("", "f64 | null", "1.5"),
    "nul_str": ("", "string | null", '"s"'), "nul_lu": ("", "(0 | 1) | null", "1"),
    "nul_lit": ("", "7 | null", "7"), "nul_strlu": ("", '("a" | "b") | null', '"a"'),
    "vu": ("", "i32 | string", "3"), "vu3": ("", "i32 | f64 | boolean", "3"),
    "vu_nul": ("", "i32 | string | null", "3"),
    "fn": ("", "(x: i32) => i32", "(x: i32) => x"),
    "fn_str": ("", "(s: string) => string", "(s: string) => s"),
    "nul_fn": ("", "((x: i32) => i32) | null", "(x: i32) => x"),
    "map": ("", "{ [string]: i32 }", "Map()"), "map_str": ("", "{ [string]: string }", "Map()"),
    "arr_i32": ("", "i32[]", "[1]"), "arr_str": ("", "string[]", '["a"]'),
    "arr_f64": ("", "f64[]", "[1.5]"), "arr_i64": ("", "i64[]", "[1]"),
    "arr_f32": ("", "f32[]", "[1.5]"), "arr_bool": ("", "boolean[]", "[true]"),
    "arr_u8": ("", "u8[]", "[1]"), "arr_lu": ("", '("a" | "b")[]', '["a"]'),
    "arr_nulstr": ("", "(string | null)[]", '["a"]'), "arr_obj": ("", "{ x: i32 }[]", "[{ x: 1 }]"),
    "arr2": ("", "i32[][]", "[[1]]"), "arr_nul": ("", "i32[] | null", "[1]"),
    "obj": ("", "{ x: i32 }", "{ x: 1 }"), "obj_nul": ("", "{ x: i32 } | null", "{ x: 1 }"),
    "neg": ("", "(i32 | string) & !string", "3"),
}

TEMPLATE = """{pre}type A = {ty}
type R = {{ f: A, g: A | null }}
type U = A | {{ tag: i32 }}
function id(a: A): A {{ return a }}
function opt(r: R | null): A | null {{
  if r == null {{ return null }}
  r.g
}}
const a: A = {v}
const r: R = {{ f: a, g: a }}
const xs: A[] = [a]
const u: U = a
print(opt(r) == null)
print(id(a) == null)
print(xs.length)
if u is {{ tag: i32 }} {{ print(u.tag) }} else {{ print(0) }}
function gen<T>(t: T): T[] {{ return [t] }}
print(gen(a).length)
"""

HOOK = "  emitCurFnPos = -1\n  emitCurStmtIx = -1\n"


def instrument(src: pathlib.Path, twins: list[str]) -> None:
    by_file = collections.defaultdict(list)
    for t in twins:
        by_file[TWINS[t][0]].append(TWINS[t][1])
    calls = []
    for n, (fname, checks) in enumerate(sorted(by_file.items())):
        fn = f"twinSweep{n}"
        body = "\n".join(checks)
        p = src / fname
        p.write_text(p.read_text() + f'''
export function {fn}(): string {{
  let out = ""
  let i = 0
  while i < T.tys.length {{
    const nm = tyToEmitName(i)
{body}
    i = i + 1
  }}
  out
}}
export function {fn}Rows(): i32 {{ T.tys.length }}
''')
        calls.append((fname, fn))
    es = src / "emit_sections.vl"
    e = es.read_text()
    if e.count(HOOK) != 1:
        sys.exit(f"twin-agreement: the emitProgram reset anchor is not unique in {es.name}; update HOOK")
    sweep = "  let twinOut = \"\"\n"
    for fname, fn in calls:
        sweep += f"  twinOut = twinOut + {fn}()\n"
        mod = "./" + fname.removesuffix(".vl")
        e = e.replace(f'}} from "{mod}"', f'  {fn},\n  {fn}Rows,\n}} from "{mod}"', 1)
    sweep += f'  emitFail("TWINSWEEP rows=" + i32ToStr({calls[0][1]}Rows()) + twinOut)\n'
    es.write_text(e.replace(HOOK, HOOK + sweep, 1))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--seed", default="build/vl-compiler.wasm")
    ap.add_argument("--twins", default=",".join(TWINS))
    ap.add_argument("--list", help="a file of extra program paths, one per line")
    ap.add_argument("--source", default="compiler",
                    help="the compiler tree to instrument (a control: an older tree whose twin is known wrong)")
    ap.add_argument("--keep", action="store_true", help="leave the scratch tree and print it")
    a = ap.parse_args()
    twins = a.twins.split(",")
    for t in twins:
        if t not in TWINS:
            sys.exit(f"twin-agreement: unknown twin {t!r}; known: {', '.join(TWINS)}")
    vl = ROOT / "scripts/vl-host/target/release/vl"
    env = dict(os.environ, VL_STD=os.environ.get("VL_STD", str(ROOT / "std")))
    work = pathlib.Path(tempfile.mkdtemp(prefix="twin-agreement-"))
    try:
        shutil.copytree((ROOT / a.source).resolve(), work / "compiler")
        instrument(work / "compiler", twins)
        probe = work / "probe.wasm"
        r = subprocess.run(["timeout", "300", str(vl), "build", "compiler/entry.vl", "-o", str(probe),
                            "--compiler", str((ROOT / a.seed).resolve())],
                           cwd=work, env=env, capture_output=True, text=True)
        if r.returncode != 0:
            print((r.stdout + r.stderr)[-2000:])
            sys.exit("twin-agreement: the probe compiler did not build")
        progs = []
        (work / "kinds").mkdir()
        for k, (pre, ty, v) in KINDS.items():
            p = work / "kinds" / f"{k}.vl"
            p.write_text(TEMPLATE.format(pre=pre, ty=ty, v=v))
            progs.append((k, p, True))
        if a.list:
            for line in pathlib.Path(a.list).read_text().splitlines():
                if line.strip():
                    progs.append((line.strip(), (ROOT / line.strip()).resolve(), False))
        bad = collections.Counter()
        where = {}
        unreached, rows = [], 0
        for label, p, must_reach in progs:
            r = subprocess.run([str(vl), "build", str(p), "-o", str(work / "out.wasm"),
                                "--compiler", str(probe)], cwd=ROOT, env=env, capture_output=True, text=True)
            m = re.search(r"TWINSWEEP rows=(\d+)(.*)", r.stdout + r.stderr)
            if not m:
                if must_reach:
                    unreached.append(label)
                continue
            rows += int(m.group(1))
            for d in re.findall(r"\[(\w+ .*?) twin=(-?\d+) orig=(-?\d+)\]", m.group(2)):
                key = f"{d[0]}  twin={d[1]} orig={d[2]}"
                bad[key] += 1
                where.setdefault(key, label)
        print(f"twin-agreement [{','.join(twins)}]: {len(progs)} programs, {rows} arena rows compared")
        for key, n in bad.most_common():
            print(f"  DISAGREE {key}   ({n} programs; first {where[key]})")
        for label in unreached:
            print(f"  UNREACHED {label} (no row count: the program never reached the emitter)")
        if a.keep:
            print(f"scratch: {work}")
        return 1 if bad or unreached else 0
    finally:
        if not a.keep:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
