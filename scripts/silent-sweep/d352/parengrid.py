#!/usr/bin/env python3
"""THE PAREN-PLACE GRID — where a `(` may stand in a narrowed PLACE, on both sides
of the guard, and whether the two spellings key the same place.

    python3 scripts/silent-sweep/d352/parengrid.py build/vl-compiler.wasm > /tmp/p.json

7 read spellings x 3 guard spellings x 4 narrowing forms x 2 place depths, plus a
16-cell RETIREMENT block = **184 cells**. Graded on the RUN, never on an exit code: the
retirement block's whole question is whether a paren-spelled WRITE retires a narrowing,
and a build that answers "no" is check-clean and wrong rather than loud.

Why it exists: `placeKeyOf` (compiler/typecheck.vl) is the CHECKER's narrowing key and it
read `P.nodes[ix]` raw, so a `Paren` anywhere in a place answered "" — no key, no overlay.
D222 fixed the EMITTER's twin (`memberPathKeyOf`) at #1991 and this one stayed paren-blind,
which is D352: `if t.v is Circle { print((t).v.r) }` is `field 'r' is not on every member
of Shape` while `t.v.r` and `(t.v).r` both print 7.

The grid has to carry BOTH sides of the guard, and the RETIREMENT block, because
`placeKeyOf` has fifteen callers and only two of them are the member READ. The others set
narrowings, retire them on assignment, bar writes, and suppress the dead-`??` hint — a peel
at the key moves all of them at once, and the retirement leg is the only one whose wrong
answer is SILENT.
"""
import json
import os
import subprocess
import sys
import tempfile

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
VL = os.path.join(R, "scripts/vl-host/target/release/vl")

DECLS = """type Circle = { r: i32 }
type Sq = { s: i32 }
type Shape = Circle | Sq
type Holder = { v: Shape }
type Outer = { h: Holder }
"""

# how the PLACE is spelled where it is READ. `@` is the place root identifier.
READS = {
    "bare": "@.v.r",
    "root": "(@).v.r",
    "outer": "(@.v).r",
    "both": "((@).v).r",
    "double": "((@)).v.r",
    "root_outer": "((@).v).r",
    "all": "(((@)).v).r",
}
# how the PLACE is spelled in the GUARD.
GUARDS = {"gbare": "@.v", "groot": "(@).v", "gouter": "(@.v)"}

# the narrowing form. `%s` takes the guarded place spelling.
FORMS = {
    "is": ("if %s is Circle { print(READ) } else { print(0) }", "{ v: { r: 7 } }", "Shape"),
    "isnot": ("if %s is Sq { print(0) } else { print(READ) }", "{ v: { r: 7 } }", "Shape"),
    "and": ("if %s is Circle && 1 == 1 { print(READ) } else { print(0) }", "{ v: { r: 7 } }", "Shape"),
    "while": ("let n = 0\nwhile %s is Circle && n == 0 { print(READ) n = 1 }", "{ v: { r: 7 } }", "Shape"),
}
# place DEPTH: one link (`t.v.r` off a Holder) or two (`o.h.v.r` off an Outer).
DEPTHS = {"one": ("t", "Holder"), "two": ("o.h", "Outer")}


def prog(read, guard, form, depth):
    root, rootty = DEPTHS[depth]
    body, val, _ = FORMS[form]
    if depth == "two":
        val = "{ h: " + val + " }"
    g = GUARDS[guard].replace("@", root)
    rd = "print(" + READS[read].replace("@", root) + ")"
    stmt = (body % g).replace("print(READ)", rd)
    arg = "t" if depth == "one" else "o"
    return DECLS + "function f(" + arg + ": " + rootty + ") {\n  " + stmt.replace("\n", "\n  ") + "\n}\nf(" + val + ")\n"


# RETIREMENT: the guard narrows the place, an assignment through a DIFFERENT paren
# spelling of the same place puts a non-Circle back, then the place is read again. The
# right answer is a diagnosed refusal (the narrowing is retired); a build that keys the
# write elsewhere reads the stale narrowing and prints a field of the wrong arm.
RET_WRITES = {"wbare": "@.v", "wroot": "(@).v"}
RET_READS = {"rbare": "@.v.r", "rroot": "(@).v.r", "router": "(@.v).r", "rboth": "((@).v).r"}


def retprog(w, rd, depth):
    root, rootty = DEPTHS[depth]
    val = "{ v: { r: 7 } }"
    if depth == "two":
        val = "{ h: " + val + " }"
    arg = "t" if depth == "one" else "o"
    wl = RET_WRITES[w].replace("@", root)
    rl = RET_READS[rd].replace("@", root)
    return (DECLS + "function f(" + arg + ": " + rootty + ") {\n"
            + "  if " + root + ".v is Circle {\n"
            + "    " + wl + " = { s: 3 }\n"
            + "    print(" + rl + ")\n"
            + "  } else { print(0) }\n"
            + "}\nf(" + val + ")\n")


def grade(src, compiler, want):
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
        out = rn.stdout.strip()
        return "runs" if out == want else "wrong:" + out
    finally:
        os.unlink(p)


def main():
    compiler = sys.argv[1] if len(sys.argv) > 1 else os.path.join(R, "build/vl-compiler.wasm")
    out = {}
    for read in READS:
        for guard in GUARDS:
            for form in FORMS:
                for depth in DEPTHS:
                    k = "read/%s/%s/%s/%s" % (read, guard, form, depth)
                    out[k] = grade(prog(read, guard, form, depth), compiler, "7")
    for w in RET_WRITES:
        for rd in RET_READS:
            for depth in DEPTHS:
                k = "ret/%s/%s/%s" % (w, rd, depth)
                # The narrowing is retired by the write, so the READ must be REFUSED.
                # `runs` here means the compiler read a stale narrowing.
                out[k] = grade(retprog(w, rd, depth), compiler, "7")
    json.dump(out, sys.stdout, indent=0, sort_keys=True)


if __name__ == "__main__":
    main()
