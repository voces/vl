#!/usr/bin/env python3
"""THE ALIAS-vs-INLINE TWIN GRID — array-spine LEAF kinds x annotation POSITIONS.

23 leaf kinds x 7 positions x {alias, alias-free control} = 322 cells. Every cell exists
TWICE: once spelled through `type L = <leaf>[]` and once with the alias-free INLINE
spelling, the two programs identical character for character apart from the annotation.
Graded on the RUN, never on an exit code — the intersection leaf's `unread` cell is
check-clean invalid wasm, which an exit-code grader reads as a pass.

    python3 scripts/silent-sweep/d188/aliasgrid.py build/vl-compiler.wasm > /tmp/g.json

The population D188 was closed on and D362 is filed against. What it is FOR: an array
alias must not be a dialect of its own, so the question every cell asks is whether the
alias leg lands on its own inline control's verdict. On master 4bdfcc67 it does not for
63 of the 161 alias cells; after #1992 the residue is the leaf that is itself a declared
ALIAS (litunion, declared union, canonicalized intersection) — D362.

It is also the ABLATION population for #1992's three rungs, and it says two things a
single build cannot: stripping the parser rung reproduces master exactly (so nothing
downstream can fire without it), and stripping the transparency arm while KEEPING the
parser rung takes nine cells from a loud check reject to check-clean invalid wasm.
"""
import subprocess, sys, os, tempfile, json

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
VL = os.path.join(R, "scripts/vl-host/target/release/vl")

# leaf name -> (extra decls, leaf spelling, one value of the leaf, a read of `x` yielding 7)
LEAVES = {
    "i32":        ("", "i32", "7", "print(X[0])"),
    "string":     ("", "string", '"s"', 'if X[0] == "s" { print(7) } else { print(0) }'),
    "cat":        ("type Cat = {n: i32}\n", "Cat", "{ n: 7 }", "print(X[0].n)"),
    "litun":      ('type K0 = "a" | "b"\n', "K0", '"a"', 'if X[0] == "a" { print(7) } else { print(0) }'),
    "numlitun":   ("type Z = 0 | 1\n", "Z", "1", "if X[0] == 1 { print(7) } else { print(0) }"),
    "declunion":  ("type Ca = {n: i32}\ntype Sq = {s: i32}\ntype U1 = Ca | Sq\n", "U1", "{ n: 7 }", "if X[0] is Ca { print(7) } else { print(0) }"),
    "map":        ("", "{[string]: i32}", "mk0()", 'print((X[0])["k"] ?? 0)'),
    "mapstruct":  ("type Cat = {n: i32}\n", "{[string]: Cat}", "mk1()", 'print(((X[0])["k"] ?? {n: 0}).n)'),
    "arrmap":     ("", "{[string]: i32}[]", "[mk0()]", 'print(((X[0])[0])["k"] ?? 0)'),
    "obj":        ("", "{n: i32}", "{ n: 7 }", "print(X[0].n)"),
    "obj2":       ("", "{a: i32, b: string}", '{ a: 7, b: "z" }', "print(X[0].a)"),
    "objnest":    ("", "{p: {q: i32}}", "{ p: { q: 7 } }", "print(X[0].p.q)"),
    "objmap":     ("", "{m: {[string]: i32}}", "{ m: mk0() }", 'print((X[0].m)["k"] ?? 0)'),
    "objcat":     ("type Cat = {n: i32}\n", "{p: Cat}", "{ p: { n: 7 } }", "print(X[0].p.n)"),
    "objk0":      ('type K0 = "a" | "b"\n', "{p: K0}", '{ p: "a" }', 'if X[0].p == "a" { print(7) } else { print(0) }'),
    "objarr":     ("", "{p: i32[]}", "{ p: [7] }", "print((X[0].p)[0])"),
    "objnull":    ("", "{p: i32 | null}", "{ p: 7 }", "print(X[0].p ?? 0)"),
    "arrobj":     ("", "{n: i32}[]", "[{ n: 7 }]", "print(((X[0])[0]).n)"),
    "isect":      ("type AB = {a: i32} & {b: i32}\n", "AB", "{ a: 7, b: 1 }", "print(X[0].a)"),
    "objdu":      ("type Ca = {n: i32}\ntype Sq = {s: i32}\ntype U1 = Ca | Sq\n", "{p: U1}", "{ p: { n: 7 } }", "if X[0].p is Ca { print(7) } else { print(0) }"),
    "nullable":   ("", "i32 | null", "7", "print(X[0] ?? 0)"),
    "catnull":    ("type Cat = {n: i32}\n", "Cat | null", "{ n: 7 }", "print((X[0] ?? {n: 0}).n)"),
    "fn":         ("", "(i32) => i32", "id1", "print(X[0](7))"),
}

HELPERS = """function mk0() {
  const m = Map()
  m["k"] = 7
  m
}
function mk1() {
  const m2 = Map()
  m2["k"] = { n: 7 }
  m2
}
function id1(q: i32) { q }
"""


def prog(leaf, pos, alias):
    decls, spell, val, read = LEAVES[leaf]
    ty = "L" if alias else spell + "[]"
    head = decls + HELPERS + (f"type L = {spell}[]\n" if alias else "")
    body = read.replace("X", "c")
    if pos == "global":
        return head + f"const c: {ty} = [{val}]\n" + body + "\n"
    if pos == "local":
        return head + f"function rd() {{\n  const c: {ty} = [{val}]\n  {body}\n}}\nrd()\n"
    if pos == "param":
        return head + f"function rd(c: {ty}) {{\n  {body}\n}}\nrd([{val}])\n"
    if pos == "ret":
        return head + f"function mk(): {ty} {{\n  [{val}]\n}}\nconst c = mk()\n" + body + "\n"
    if pos == "unread":
        # D181's silent spelling: an UNREAD `_`-prefixed binding of the alias beside a
        # structurally-spelled twin that carries the reads.
        return head + f"const _sp1: {ty} = []\nconst c: {spell}[] = [{val}]\n" + body + "\n"
    if pos == "field":
        return head + f"type H = {{ c: {ty} }}\nconst h: H = {{ c: [{val}] }}\n" + body.replace("c[0]", "(h.c)[0]").replace("(c[0])", "((h.c)[0])") + "\n"
    if pos == "unionmem":
        return head + f"function rd(c: {ty} | i32) {{\n  if c is i32 {{ print(0) }} else {{ {body} }}\n}}\nrd([{val}])\n"
    raise SystemExit("bad pos " + pos)


POSITIONS = ["global", "local", "param", "ret", "unread", "field", "unionmem"]


def grade(src, compiler):
    with tempfile.NamedTemporaryFile("w", suffix=".vl", delete=False, dir="/tmp") as f:
        f.write(src)
        p = f.name
    try:
        ck = subprocess.run([VL, "check", p, "--compiler", compiler], capture_output=True, text=True)
        if ck.returncode != 0:
            return "check_reject", (ck.stderr + ck.stdout).strip().splitlines()[-1][:90] if (ck.stderr + ck.stdout).strip() else ""
        rn = subprocess.run([VL, "run", p, "--compiler", compiler], capture_output=True, text=True)
        out = rn.stdout.strip()
        err = (ck.stderr + rn.stderr).strip()
        if rn.returncode != 0:
            msg = err.splitlines()[-1][:90] if err else ""
            if "emitProgram" in err or "compiler emit bug" in err or "unsupported" in err:
                return "emit_reject", msg
            if "type mismatch" in err or "not a valid WebAssembly" in err or "expected" in err:
                return "invalid_wasm", msg
            return "emit_reject", msg
        if out == "7":
            return "runs", ""
        return "wrong:" + out, ""
    finally:
        os.unlink(p)


def main():
    compiler = sys.argv[1] if len(sys.argv) > 1 else os.path.join(R, "build/vl-compiler.wasm")
    out = {}
    for leaf in LEAVES:
        for pos in POSITIONS:
            for spelling in ("alias", "inline"):
                k = f"{leaf}/{pos}/{spelling}"
                o, m = grade(prog(leaf, pos, spelling == "alias"), compiler)
                out[k] = o
    json.dump(out, sys.stdout, indent=0, sort_keys=True)


if __name__ == "__main__":
    main()
