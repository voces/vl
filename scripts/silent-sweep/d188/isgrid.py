#!/usr/bin/env python3
"""THE `is`-NON-VARIANT GRID — receiver union x checked primitive x READ x MINT.

10 receiver unions x 6 checked primitives x 2 positions x 3 mint states x {read the
narrowed binding in the then-branch, print a constant} = 720 cells.

    python3 scripts/silent-sweep/d188/isgrid.py build/vl-compiler.wasm > /tmp/i.json

TWO AXES THE ROW THAT NEEDED THIS GRID DID NOT HAVE, and each of them changed a claim.

  · the READ. With a CONSTANT in the then-branch every admitted non-variant `is` RUNS on
    every compiler back to `16d5c6e7`. #1972's `runs` -> not-runs move needs the narrowed
    binding to be READ there, because that is what installs the value-box lowering — so a
    control table that varies the CHECK TYPE and holds the then-branch fixed cannot see
    which half of the class it is looking at. Cell-matched, `e44ef5e6` -> master moves
    exactly 28 cells and all 28 are `readg`.

  · the MINT. `vb*Idx` is assigned only when `mAssignTypeIndices` sees `vb*Used`, so an
    unrelated `const _h: i32 | null = 3` elsewhere in the module decides whether the same
    two lines build. The three mint states separate "this program is broken" from "this
    program is broken in modules that declare nothing else".

The receiver axis is what showed the hole is the WIDENING LATTICE (i32->i64, i32->f64,
f32->f64) rather than one spelling: `f64|null is f32`, `i64|null is i32` and
`f64|string is i32` are all admitted, and the three spellings D228 probed (`i64`,
`boolean`, `string` on an `f64|null`) are exactly the three that do not widen.
"""
import subprocess, sys, os, tempfile, json
from concurrent.futures import ThreadPoolExecutor

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
VL = os.path.join(R, "scripts/vl-host/target/release/vl")
JOBS = int(os.environ.get("JOBS", "6"))

RECV = {
    "f64null":  ("f64 | null", "5.0"),
    "i64null":  ("i64 | null", "5"),
    "i32null":  ("i32 | null", "5"),
    "f32null":  ("f32 | null", "5.0"),
    "strnull":  ("string | null", '"s"'),
    "boolnull": ("boolean | null", "true"),
    "f64str":   ("f64 | string", "5.0"),
    "i64str":   ("i64 | string", "5"),
    "i32str":   ("i32 | string", "5"),
    "f32str":   ("f32 | string", "5.0"),
}
CHECKED = ["i32", "i64", "f64", "f32", "string", "boolean"]
MINTS = {"nomint": "", "i32mint": "const _h: i32 | null = 3\n", "i64mint": "const _h: i64 | null = 3\n"}
READS = {"readg": "print(g)", "const": "print(1)"}


def prog(recv, chk, pos, mint, read):
    decl, val = RECV[recv]
    m, r = MINTS[mint], READS[read]
    if pos == "global":
        return m + "const g: %s = %s\nif g is %s { %s } else { print(0) }\n" % (decl, val, chk, r)
    return m + "function f(g: %s) {\n  if g is %s { %s } else { print(0) }\n}\nf(%s)\n" % (decl, chk, r, val)


POS = ["global", "fn"]


def grade(args):
    src, compiler = args
    with tempfile.NamedTemporaryFile("w", suffix=".vl", delete=False, dir="/tmp") as f:
        f.write(src)
        p = f.name
    try:
        ck = subprocess.run([VL, "check", p, "--compiler", compiler], capture_output=True, text=True)
        if ck.returncode != 0:
            return "check_reject"
        rn = subprocess.run([VL, "run", p, "--compiler", compiler], capture_output=True, text=True)
        err = (ck.stderr + rn.stderr)
        if rn.returncode != 0:
            if "emitProgram" in err or "emit error" in err:
                return "emit_reject"
            if "wasm trap" in err:
                return "trap"
            return "invalid_wasm"
        return "runs:" + rn.stdout.strip()
    finally:
        os.unlink(p)


def main():
    compiler = sys.argv[1]
    ks, srcs = [], []
    for recv in RECV:
        for chk in CHECKED:
            for pos in POS:
                for mint in MINTS:
                    for read in READS:
                        ks.append("%s/%s/%s/%s/%s" % (recv, chk, pos, mint, read))
                        srcs.append((prog(recv, chk, pos, mint, read), compiler))
    with ThreadPoolExecutor(max_workers=JOBS) as ex:
        vals = list(ex.map(grade, srcs))
    json.dump(dict(zip(ks, vals)), sys.stdout, indent=0, sort_keys=True)


if __name__ == "__main__":
    main()
