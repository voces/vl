#!/usr/bin/env python3
"""D426 — a LAMBDA declared inside a generic body, over lambda-parameter SHAPE ×
`T` binding × lambda BODY.

The row's own price note asks for exactly this grid before anyone touches the
monomorphizer: what is broken is not the comparison and not the route, it is the
SHAPE of the lambda's parameter type. `monoCloneBody` rebuilds the statement spine
and leaves a lambda's own annotation un-substituted (its header says so), and
`collectFns` has already lifted the lambda — so one lifted function serves every
instance and its `$fnsig` is interned at the unsubstituted type.

Each generic cell is graded beside a CONTROL: the identical program with the
lambda's parameter annotation written out at the binding's own concrete type. The
control is what the cell would be if the substitution reached the lambda, so a
`gen` that is silent where `con` runs is a lost lowering, and a `gen` that is
silent where `con` is loud is a lost refusal.

    JOBS=6 python3 scripts/silent-sweep/d426/lamgrid.py <compiler.wasm>
"""
import concurrent.futures
import json
import os
import subprocess
import sys
import tempfile

R = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)
VL = os.path.join(R, "scripts/vl-host/target/release/vl")
JOBS = int(os.environ.get("JOBS", "6"))

# binding name -> (extra decls, the concrete type `T` is pinned to, a value of it)
BINDS = {
    "i32": ("", "i32", "1"),
    "f64": ("", "f64", "1.5"),
    "bool": ("", "boolean", "true"),
    "str": ("", '"s"', None),  # placeholder, filled below
    "rec": ("type Circle = { r: i32 }\n", "Circle", "{ r: 1 }"),
    "arr": ("", "i32[]", "[1]"),
}
BINDS["str"] = ("", "string", '"s"')
# The COINCIDENCE HUNT. A shared lifted lambda is correct exactly where the
# unsubstituted annotation's valtype happens to equal the instance's, so the
# binding axis has to be wide enough to find those: `boolean | null` is a plain
# i32 sentinel and so is the `T | null` default, which is the one cell of this
# grid that runs for a reason nothing in the program states.
BINDS["i64"] = ("", "i64", "1L")
BINDS["f32"] = ("", "f32", "1.5f")
BINDS["nuli"] = ("", "i32 | null", "1")
BINDS["lit"] = ('type K = "a" | "b"\n', "K", '"a"')

# lambda parameter SHAPE, as a function of the type-parameter spelling
SHAPES = {
    "bare": "%s",
    "arr": "%s[]",
    "nul": "%s | null",
    "arr2": "%s[][]",
    "map": "{[string]: %s}",
    "fn": "(%s) => %s",
}

# body name -> (arity, the lambda body, the outer return type, how the outer
# function makes a value of the PARAMETER shape from its own `a: <shape>`)
BODIES = {
    "id": (1, "x", "shape"),
    "eq": (2, "x == y", "boolean"),
    "len": (1, "x.length", "i32"),
}


def shape_of(kind, tname):
    s = SHAPES[kind]
    return s % ((tname, tname) if kind == "fn" else tname)


def mk(kind, bind, body, generic):
    """Build one program. `generic` False writes the CONTROL: the lambda's
    parameter annotation spelled at the binding's own concrete type."""
    decls, conc, val = BINDS[bind]
    arity, lbody, ret = BODIES[body]
    # the type the OUTER generic parameter carries, and the value the cell builds
    outer_t = shape_of(kind, "T")
    outer_c = shape_of(kind, conc)
    lam_t = outer_t if generic else outer_c
    if ret == "shape":
        rty = outer_t
        crty = outer_c
    else:
        rty = ret
        crty = ret
    # a value of the concrete SHAPE, built in `cell`
    if kind == "bare":
        cval = val
    elif kind == "arr":
        cval = "[" + val + "]"
    elif kind == "nul":
        cval = val
    elif kind == "arr2":
        cval = "[[" + val + "]]"
    elif kind == "map":
        cval = "mkm()"
    else:  # fn
        cval = "idf"
    helpers = ""
    if kind == "map":
        helpers += (
            "function mkm(): {[string]: " + conc + "} {\n"
            "  const m: {[string]: " + conc + "} = Map()\n"
            '  m["k"] = ' + val + "\n"
            "  m\n}\n"
        )
    if kind == "fn":
        helpers += "function idf(q: " + conc + "): " + conc + " { q }\n"
    ps = ["x", "y"][:arity]
    lam_params = ", ".join("%s: %s" % (p, lam_t) for p in ps)
    outer_params = ", ".join("%s: %s" % (chr(ord("a") + i), outer_t) for i in range(arity))
    call_args = ", ".join(chr(ord("a") + i) for i in range(arity))
    src = decls + helpers
    src += (
        "function opT<T>(" + outer_params + "): " + rty + " {\n"
        "  const g = (" + lam_params + ") => " + lbody + "\n"
        "  return g(" + call_args + ")\n"
        "}\n"
    )
    binds = "\n".join(
        "  const %s: %s = %s" % (chr(ord("a") + i), outer_c, cval) for i in range(arity)
    )
    src += "function cell(): " + crty + " {\n" + binds + "\n  return opT(" + call_args + ")\n}\n"
    if ret == "shape":
        src += "const z = cell()\nprint(1)\n"
    else:
        src += "print(cell())\n"
    return src


def grade(src, compiler):
    with tempfile.NamedTemporaryFile("w", suffix=".vl", delete=False, dir="/tmp") as f:
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
    jobs = []
    for kind in SHAPES:
        for bind in BINDS:
            for body in BODIES:
                for gen in (True, False):
                    key = "%s/%s/%s/%s" % (
                        "gen" if gen else "con",
                        kind,
                        bind,
                        body,
                    )
                    jobs.append((key, mk(kind, bind, body, gen)))
    out = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=JOBS) as ex:
        futs = {ex.submit(grade, src, compiler): k for k, src in jobs}
        for f in concurrent.futures.as_completed(futs):
            out[futs[f]] = f.result()
    json.dump(out, sys.stdout, indent=0, sort_keys=True)


if __name__ == "__main__":
    main()
