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

The control, which must disagree on every kind: `--rev` instruments `compiler/` as it stood at
an older commit, where the twin was wrong. A function the sweep calls is imported into the
sweep's file from whichever module of that tree exports it, so a twin that has since moved
between modules still resolves:

  python3 scripts/twin-agreement.py --twins vak --rev c114b836f

The sweep runs once, at the top of `emitProgram`, so a row created after that — a
monomorphization pin, a type an instance substitutes — is never compared. For those, probe
the CALL SITE instead: patch a copy of the site to `emitFail` when the twin and the original
answer differently, build that compiler, and build every program in `tests/cases/` and the
distilled corpus with it, counting both the programs that reach the site and the mismatches.
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


def import_callees(src: pathlib.Path, fname: str, body: str) -> None:
    """Imports every function `body` calls that `fname` neither defines nor imports, from the
    module of `src` that exports it."""
    p = src / fname
    text = p.read_text()
    adds = []
    for name in sorted(set(re.findall(r"\b([a-z]\w*)\(", body))):
        if re.search(rf"^(export )?function {name}\b", text, re.M):
            continue
        if re.search(rf"^\s*{name},?\s*$|import \{{[^}}]*\b{name}\b", text, re.M):
            continue
        home = [f for f in sorted(src.glob("*.vl"))
                if f.name != fname and re.search(rf"^export function {name}\b", f.read_text(), re.M)]
        if home:
            adds.append(f'import {{ {name} }} from "./{home[0].stem}"\n')
    if adds:
        p.write_text("".join(adds) + text)


def instrument(src: pathlib.Path, twins: list[str]) -> None:
    by_file = collections.defaultdict(list)
    for t in twins:
        by_file[TWINS[t][0]].append(TWINS[t][1])
    calls = []
    for n, (fname, checks) in enumerate(sorted(by_file.items())):
        fn = f"twinSweep{n}"
        body = "\n".join(checks)
        import_callees(src, fname, body)
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
    ap.add_argument("--rev", help="instrument compiler/ as of this git revision instead (the control)")
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
        if a.rev:
            arc = subprocess.run(["git", "archive", a.rev, "compiler"], cwd=ROOT, capture_output=True)
            if arc.returncode != 0:
                sys.exit(f"twin-agreement: git archive {a.rev} failed: {arc.stderr.decode()[-300:]}")
            subprocess.run(["tar", "-x", "-C", str(work)], input=arc.stdout, check=True)
        else:
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
        list_total = list_reached = 0
        for label, p, must_reach in progs:
            r = subprocess.run([str(vl), "build", str(p), "-o", str(work / "out.wasm"),
                                "--compiler", str(probe)], cwd=ROOT, env=env, capture_output=True, text=True)
            m = re.search(r"TWINSWEEP rows=(\d+)(.*)", r.stdout + r.stderr)
            if not must_reach:
                list_total += 1
            if not m:
                if must_reach:
                    unreached.append(label)
                continue
            if not must_reach:
                list_reached += 1
            rows += int(m.group(1))
            # One count per program: the same row shape recurs within a program's arena.
            for key in {f"{d[0]}  twin={d[1]} orig={d[2]}"
                        for d in re.findall(r"\[(\w+ .*?) twin=(-?\d+) orig=(-?\d+)\]", m.group(2))}:
                bad[key] += 1
                where.setdefault(key, label)
        reached = len(progs) - len(unreached) - (list_total - list_reached)
        print(f"twin-agreement [{','.join(twins)}]: {reached} programs reached the emitter, "
              f"{rows} arena rows compared")
        if a.list:
            print(f"  --list: {list_reached} of {list_total} reached the emitter; "
                  f"{list_total - list_reached} stopped earlier (a check, parse or emit refusal) and compared nothing")
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
