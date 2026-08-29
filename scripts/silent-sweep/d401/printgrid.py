#!/usr/bin/env python3
"""D401 — `print(<value derived from an unbounded type parameter>)`, over every
argument rep D14's `lengrid.py` names, at four PRINT POSITIONS.

D14's grid varied the OPERATION (`.length` vs `x[0]`) and printed the result. This
one holds the operation at `print` and varies what is handed to it: the parameter
ITSELF, an element read, a field read, and the `.length` (an i32 control that must
never move). Each generic cell is graded beside its CONCRETE twin — the same
program with the type parameter replaced by the argument's own type — because the
whole of D401 is that the two disagree: the concrete spelling is a clean check
reject and the generic one is check-clean invalid wasm.

The `con/*` column is the ORACLE, not a control: wherever `gen` and `con` differ
and `con` is the louder of the two, the generic path has lost a refusal.
"""
import json, os, subprocess, sys, tempfile

R = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)
VL = os.path.join(R, "scripts/vl-host/target/release/vl")

# rep name -> (extra decls, a value expression)
REPS = {
    "arr_i32": ("", "[7, 8]"),
    "arr_nest": ("", "[[7, 8]]"),
    "arr_str": ("", '["a", "b"]'),
    "arr_rec": ("type Cat = { n: i32 }\n", "[{ n: 7 }]"),
    "arr_arr_s": ("", '[["a"]]'),
    "arr_f64": ("", "[1.5, 2.5]"),
    "arr_bool": ("", "[true]"),
    "arr_nul_i32": ("", "mknuls()"),
    "str": ("", '"abc"'),
    "map_s_i32": ("MK", "mk()"),
    "set_s": ("MK", "mkset()"),
    "rec": ("type Cat = { n: i32 }\n", "{ n: 7 }"),
    "i32": ("", "7"),
    "f64": ("", "1.5"),
    "bool": ("", "true"),
    "nul_i32": ("", "mknul()"),
    "fn": ("", "id1"),
    "union": (
        "type Ca = { n: i32 }\ntype Sq = { s: i32 }\ntype U1 = Ca | Sq\n"
        "function mku(): U1 { { n: 7 } }\n",
        "mku()",
    ),
    "vunion": ("function mkv(): i32 | string { 7 }\n", "mkv()"),
}

# the CONCRETE spelling of each rep, for the `con/` twin's parameter annotation
CONC = {
    "arr_i32": "i32[]",
    "arr_nest": "i32[][]",
    "arr_str": "string[]",
    "arr_rec": "Cat[]",
    "arr_arr_s": "string[][]",
    "arr_f64": "f64[]",
    "arr_bool": "boolean[]",
    "arr_nul_i32": "(i32 | null)[]",
    "str": "string",
    "map_s_i32": "{[string]: i32}",
    "set_s": "{[string]: boolean}",
    "rec": "Cat",
    "i32": "i32",
    "f64": "f64",
    "bool": "boolean",
    "nul_i32": "i32 | null",
    "fn": "(i32) => i32",
    "union": "U1",
    "vunion": "i32 | string",
}

HELP = """function mk() {
  const m: {[string]: i32} = Map()
  m["a"] = 1
  m
}
function mkset() {
  const s: {[string]: boolean} = Set()
  s.add("a")
  s
}
function id1(q: i32) { q }
function mknul(): i32 | null { 7 }
function mknuls(): (i32 | null)[] { [7] }
"""

BODIES = {
    "bare": "print(x)",
    "index": "print(x[0])",
    "field": "print(x.n)",
    "len": "print(x.length)",
}


def decls_of(rep):
    d = REPS[rep][0]
    return "" if d == "MK" else d


def prog(rep, op):
    val = REPS[rep][1]
    return (
        decls_of(rep)
        + HELP
        + "function g<T>(x: T) { "
        + BODIES[op]
        + " }\n"
        + "function body() {\n  const v = "
        + val
        + "\n  g(v)\n}\nbody()\n"
    )


def concrete(rep, op):
    val = REPS[rep][1]
    return (
        decls_of(rep)
        + HELP
        + "function g(x: "
        + CONC[rep]
        + ") { "
        + BODIES[op]
        + " }\n"
        + "function body() {\n  const v = "
        + val
        + "\n  g(v)\n}\nbody()\n"
    )


def grade(src, compiler):
    with tempfile.NamedTemporaryFile(
        "w", suffix=".vl", delete=False, dir="/tmp"
    ) as f:
        f.write(src)
        p = f.name
    try:
        ck = subprocess.run(
            [VL, "check", p, "--compiler", compiler], capture_output=True, text=True
        )
        if ck.returncode != 0:
            return "check_reject"
        rn = subprocess.run(
            [VL, "run", p, "--compiler", compiler], capture_output=True, text=True
        )
        err = (ck.stderr + rn.stderr).strip()
        if rn.returncode != 0:
            if "emitProgram" in err or "compiler emit bug" in err or "unsupported" in err:
                return "emit_reject"
            if "not a valid WebAssembly" in err or "type mismatch" in err:
                return "invalid_wasm"
            return "trap"
        return "runs:" + rn.stdout.strip().replace("\n", "|")
    finally:
        os.unlink(p)


def main():
    compiler = (
        sys.argv[1] if len(sys.argv) > 1 else os.path.join(R, "build/vl-compiler.wasm")
    )
    out = {}
    for rep in REPS:
        for op in BODIES:
            out["gen/%s/%s" % (rep, op)] = grade(prog(rep, op), compiler)
            out["con/%s/%s" % (rep, op)] = grade(concrete(rep, op), compiler)
    json.dump(out, sys.stdout, indent=0, sort_keys=True)


if __name__ == "__main__":
    main()
