#!/usr/bin/env python3
"""D14 — `.length` vs `x[i]` on an UNBOUNDED type parameter, over every rep the
row's own table names, plus the reps where the operation has NO meaning.

The row's actionable claim is that the two decisions disagree: `x[0][1]` is admitted
on an unbounded `T` and `.length` is refused. This grades both operations at the same
argument reps, so "admit `.length` too" can be priced against what INDEXING already
does at the reps where the operation is meaningless.
"""
import json, os, subprocess, sys, tempfile

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
VL = os.path.join(R, "scripts/vl-host/target/release/vl")

# rep name -> (decls, a value expression, want for .length, want for [0])
REPS = {
    "arr_i32":   ("", "[7, 8]", "2", "7"),
    "arr_nest":  ("", "[[7, 8]]", "1", None),
    "arr_str":   ("", '["a", "b"]', "2", None),
    "str":       ("", '"abc"', "3", None),
    "map_s_i32": ("MKMAP", "mk()", "1", None),
    "set_s":     ("MKSET", "mkset()", "1", None),
    "rec":       ("type Cat = { n: i32 }\n", "{ n: 7 }", None, None),
    "i32":       ("", "7", None, None),
    "f64":       ("", "1.5", None, None),
    "bool":      ("", "true", None, None),
    "nul_i32":   ("", "mknul()", None, None),
    "fn":        ("", "id1", None, None),
    "union":     ("type Ca = { n: i32 }\ntype Sq = { s: i32 }\ntype U1 = Ca | Sq\nfunction mku(): U1 { { n: 7 } }\n", "mku()", None, None),
    "arr_rec":   ("type Cat = { n: i32 }\n", "[{ n: 7 }]", "1", None),
    "arr_arr_s": ("", '[["a"]]', "1", None),
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
""" 


def prog(rep, op):
    decls, val, wlen, widx = REPS[rep]
    d = "" if decls in ("MKMAP", "MKSET") else decls
    body = "print(x.length)" if op == "length" else "print(x[0])"
    return (d + HELP + "function g<T>(x: T) { " + body + " }\n"
            + "function body() {\n  const v = " + val + "\n  g(v)\n}\nbody()\n")


def concrete(rep, op):
    """the NON-generic twin: the same operation applied directly."""
    decls, val, wlen, widx = REPS[rep]
    d = "" if decls in ("MKMAP", "MKSET") else decls
    body = "print(v.length)" if op == "length" else "print(v[0])"
    return d + HELP + "function body() {\n  const v = " + val + "\n  " + body + "\n}\nbody()\n"


def grade(src, compiler):
    with tempfile.NamedTemporaryFile("w", suffix=".vl", delete=False, dir="/tmp") as f:
        f.write(src)
        p = f.name
    try:
        ck = subprocess.run([VL, "check", p, "--compiler", compiler], capture_output=True, text=True)
        if ck.returncode != 0:
            return "check_reject"
        rn = subprocess.run([VL, "run", p, "--compiler", compiler], capture_output=True, text=True)
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
    compiler = sys.argv[1] if len(sys.argv) > 1 else os.path.join(R, "build/vl-compiler.wasm")
    out = {}
    for rep in REPS:
        for op in ("length", "index"):
            out["gen/%s/%s" % (rep, op)] = grade(prog(rep, op), compiler)
            out["con/%s/%s" % (rep, op)] = grade(concrete(rep, op), compiler)
    json.dump(out, sys.stdout, indent=0, sort_keys=True)


if __name__ == "__main__":
    main()
