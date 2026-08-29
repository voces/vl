#!/usr/bin/env python3
"""
The `elem_place` grid inventory-2 D11 is filed against: 23 gap reps x 4 narrowing
constructs x 2 runtime inputs = 184 cells, every cell narrowing `xs[0]` IN PLACE and
then reading it.

WHY THIS FILE EXISTS AT ALL.  #1993 built this grid, priced a candidate against it and
then threw the generator away, so #2001 had to rebuild it from the 51 cells that had
been kept in `distilled/named/`.  It is committed now, and `--verify` re-derives those
51 and asserts they are byte-identical to the copies under `distilled/named/` — so the
grid the price was measured on and the grid a later reader regenerates are provably the
same programs, not a paraphrase of them.

THE READ HAS TO CONSUME THE NARROWED TYPE, and that is the row's own correction.  D11
was first filed as "162 of 184, and it works for the niche reps", on a grid whose
newtype cells read `print(xs[0])` — but `print` of a nullable `new string` is simply
ALLOWED, so those cells were green because of the use site and not because anything
narrowed.  Every rep here therefore reads through a site that refuses a nullable:
an index for the arrays, `.size` for the maps and sets, a declared-parameter call for
the reps `print` tolerates, and a field read for the structs.  The four scalar newtypes
keep `print(xs[0])`, which already refuses a nullable, and that is why their cells here
are byte-identical to the ones #1993 filed.

Usage:
  python3 mkgrid.py <outdir>          write all 184 cells + manifest.json
  python3 mkgrid.py <outdir> --verify also assert the 51 priced cells match named/
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NAMED = os.path.normpath(os.path.join(HERE, "..", "distilled", "named"))

# rep -> (module-scope prelude lines, carried payload type, present-value expression,
#         read STATEMENT over {X}, extra decls the READ needs)
#
# EXPECT is the stdout each cell must produce, computed from the program the generator
# just wrote and never from the compiler: input 0 prints the read's value, input 1
# prints `NUL`.  A cell whose expectation is wrong grades `runs but wrong value`, which
# is a SILENT column — so a lazy expectation here would read as a defect in the compiler.
REPS = {
    "set_str": ([
        'function mkSetStr(): {[string]: boolean} {',
        '  const s: {[string]: boolean} = Set()',
        '  s.add("a")',
        '  return s',
        '}',
    ], "{[string]: boolean}", "mkSetStr()", "print({X}.size)", []),
    "set_i32": ([
        'function mkSetI32(): {[i32]: boolean} {',
        '  const s: {[i32]: boolean} = Set()',
        '  s.add(1)',
        '  return s',
        '}',
    ], "{[i32]: boolean}", "mkSetI32()", "print({X}.size)", []),
    "map_str": ([
        'function mkMapStr(): {[string]: i32} {',
        '  const m: {[string]: i32} = Map()',
        '  m["a"] = 1',
        '  return m',
        '}',
    ], "{[string]: i32}", "mkMapStr()", "print({X}.size)", []),
    "map_i32": ([
        'function mkMapI32(): {[i32]: string} {',
        '  const m: {[i32]: string} = Map()',
        '  m[1] = "a"',
        '  return m',
        '}',
    ], "{[i32]: string}", "mkMapI32()", "print({X}.size)", []),
    # the four scalar newtypes: `print` of `Nt | null` is already a check reject, so the
    # cheapest consuming site IS `print`, and these eight files per rep are the ones
    # #1993 priced.
    "nt_i32": (["type NtI32 = new i32"], "NtI32", "7", "print({X})", []),
    "nt_i64": (["type NtI64 = new i64"], "NtI64", "7", "print({X})", []),
    "nt_f64": (["type NtF64 = new f64"], "NtF64", "1.5", "print({X})", []),
    "nt_f32": (["type NtF32 = new f32"], "NtF32", "1.5", "print({X})", []),
    # `print` of these three is tolerant of a nullable, so the read is a call whose
    # parameter is DECLARED at the payload type — the row's own separating probe.
    "nt_str": (["type NtStr = new string"], "NtStr", '"aa"',
               "take({X})", ["function take(v: NtStr) { print(v) }"]),
    "nt_bool": (["type NtBool = new boolean"], "NtBool", "true",
                "take({X})", ["function take(v: NtBool) { print(v) }"]),
    "nt_litunion": (['type NtLit = new ("p" | "q")'], "NtLit", '"p"',
                    "take({X})", ["function take(v: NtLit) { print(v) }"]),
    "nt_struct": (["type NtRec = new { x: i32 }"], "NtRec", "{ x: 2 }",
                  "take({X})", ["function take(v: NtRec) { print(v.x) }"]),
    "arr2_i32": ([], "i32[][]", "[[1, 2]]", "print({X}[0][1])", []),
    "arr2_str": ([], "string[][]", '[["aa", "bb"]]', "print({X}[0][1])", []),
    "arr2_i64": ([], "i64[][]", "[[1, 2]]", "print({X}[0][1])", []),
    "arr2_f64": ([], "f64[][]", "[[1.5, 2.5]]", "print({X}[0][1])", []),
    "arr2_f32": ([], "f32[][]", "[[1.5, 2.5]]", "print({X}[0][1])", []),
    "arr2_bool": ([], "boolean[][]", "[[false, true]]", "print({X}[0][1])", []),
    "arr2_struct": (["type Rec = { x: i32 }"], "Rec[][]", "[[{ x: 1 }, { x: 2 }]]",
                    "print({X}[0][1].x)", []),
    "arr3_i32": ([], "i32[][][]", "[[[1, 2]]]", "print({X}[0][0][1])", []),
    "arr3_str": ([], "string[][][]", '[[["aa", "bb"]]]', "print({X}[0][0][1])", []),
    "flat_rec": (["flat type FRec = { a: i32, b: i32, c: i32 }"], "FRec",
                 "{ a: 1, b: 2, c: 3 }", "print({X}.b)", []),
    "flat_nest": ([
        "flat type FIn = { p: i32, q: i32 }",
        "flat type FOut = { a: i32, inner: FIn }",
    ], "FOut", "{ a: 1, inner: { p: 2, q: 3 } }", "print({X}.inner.q)", []),
}

CONSTRUCTS = ["nenull", "eqnull_else", "is_t", "match_null"]

# rep -> what the read prints on input 0 (input 1 always prints `NUL`).
EXPECT0 = {
    "set_str": "1", "set_i32": "1", "map_str": "1", "map_i32": "1",
    "nt_i32": "7", "nt_i64": "7", "nt_f64": "1.5", "nt_f32": "1.5",
    "nt_str": "aa", "nt_bool": "true", "nt_litunion": "p", "nt_struct": "2",
    "arr2_i32": "2", "arr2_str": "bb", "arr2_i64": "2", "arr2_f64": "2.5",
    "arr2_f32": "2.5", "arr2_bool": "true", "arr2_struct": "2",
    "arr3_i32": "2", "arr3_str": "bb",
    "flat_rec": "2", "flat_nest": "3",
}


def cell(rep_name, con, inp):
    pre, ty, val, read, extra = REPS[rep_name]
    x = read.replace("{X}", "xs[0]")
    lines = []
    lines += pre
    lines += extra
    lines.append("const IN = %d" % inp)
    lines.append("function src(): %s | null {" % ty)
    lines.append("  if IN == 1 { return null }")
    lines.append("  return %s" % val)
    lines.append("}")
    lines.append("function body() {")
    lines.append("  const xs: (%s | null)[] = [src()]" % ty)
    # `x` is a whole STATEMENT, not an expression: the reps `print` tolerates read
    # through a void `take(…)` call instead, and wrapping that in a `print` would make
    # every one of their cells `print expects a value, got void` — a loud reject that
    # says nothing about narrowing and would have been read as one that did.
    if con == "nenull":
        lines.append('  if xs[0] != null { %s } else { print("NUL") }' % x)
    elif con == "eqnull_else":
        lines.append('  if xs[0] == null { print("NUL") } else { %s }' % x)
    elif con == "is_t":
        lines.append('  if xs[0] is %s { %s } else { print("NUL") }' % (ty, x))
    elif con == "match_null":
        lines.append("  match xs[0] {")
        lines.append('    null => print("NUL")')
        lines.append("    %s => %s" % (ty, x))
        lines.append("  }")
    lines.append("}")
    lines.append("body()")
    return "\n".join(lines) + "\n"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    outdir = sys.argv[1]
    verify = "--verify" in sys.argv[2:]
    os.makedirs(outdir, exist_ok=True)
    man = {}
    expect = {}
    n = 0
    for rep_name in REPS:
        for con in CONSTRUCTS:
            for inp in (0, 1):
                name = "d341_%s_%s_in%d" % (rep_name, con, inp)
                src = cell(rep_name, con, inp)
                with open(os.path.join(outdir, name + ".vl"), "w") as f:
                    f.write(src)
                man[name] = {"rep": rep_name, "construct": con, "input": inp}
                expect[name] = "NUL" if inp else EXPECT0[rep_name]
                n += 1
    with open(os.path.join(outdir, "manifest.json"), "w") as f:
        json.dump({"cells": man, "expect": expect}, f, indent=1, sort_keys=True)
    print("wrote %d cells (%d reps x %d constructs x 2 inputs) to %s"
          % (n, len(REPS), len(CONSTRUCTS), outdir))
    if n != 184:
        print("EXPECTED 184 CELLS, GOT %d" % n)
        return 1
    if verify:
        bad = 0
        checked = 0
        for name in sorted(man):
            ref = os.path.join(NAMED, name + ".vl")
            if not os.path.exists(ref):
                continue
            checked += 1
            a = open(ref).read()
            b = open(os.path.join(outdir, name + ".vl")).read()
            if a != b:
                bad += 1
                print("DIFFERS FROM named/: %s" % name)
                print(subprocess.run(
                    ["diff", ref, os.path.join(outdir, name + ".vl")],
                    capture_output=True, text=True).stdout)
        print("verify: %d cells also present in named/, %d differ" % (checked, bad))
        if bad:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
