#!/usr/bin/env python3
"""D581 / D582 — the two destinations D572's table could not reach, graded BY THE VALUE
against the one-token-different DIRECT spelling.

THE QUESTION, and why it is not D572's. That row wired a sixth deferred table (`letCstr*`)
so a value landing in a hole-typed local / re-assignment / field / element inside a generic
body is re-asked at the pin. Two spellings survived it, and this grid asks both:

    D581  the value lands inside a LITERAL CONTAINER aimed at the destination
          (`const xs: string[] = [self]`). The constraint IS recorded and IS re-asked —
          what fails is the PREDICATE: `assignableExpr`'s array-literal recursion reads
          each element's type off `nodeTyIxOf(elem)`, the element NODE's own record, which
          at the pin still carries the UN-SUBSTITUTED hole. Its ObjLit sibling three lines
          up reads `objFieldType(srcTy, name)` — off the SUBSTITUTED container — which is
          the entire reason `const b: Bx = { v: self }` is loud today and `[self]` is not.
    D582  the value is an argument to a BUILTIN COLLECTION METHOD (`xs.push(self)`,
          `m.set("k", self)`). No table records it at all: `argCstr` is recorded from the
          user-function call path and a builtin has no `FuncDecl`, so the argument check is
          the builtin's own arm and `assignable(T, string)` waves the value past it.

EVERY CELL SHIPS WITH ITS DIRECT TWIN and the twin differs in EXACTLY ONE thing: the type
PARAMETER is written out as the argument's own type (`<T>(self: T)` becomes
`(self: string)`). Same body, same constants, same call, same `print`. So every expected
answer here is the language's own answer to the same question, spelled out.

GRADED BY VALUE. The worst cell in this family is not a reject and not invalid wasm:
`const xs: boolean[] = [self]` at `g(0)` VALIDATES and prints `false` for an argument that
was the i32 `0`, because i32 and boolean share a rep — beside a direct twin that is a loud
`cannot assign i32[] to 'xs' of type boolean[]`. A grid that prints a constant cannot see
that cell, and this family has now cost three grids exactly that way (#2016, #2018, #2019).
`want_of` returns a SENTINEL, never a fabricated default, wherever the language accepts no
value at the position.

THE AXES, and why each is separate:

    shape  (block L) HOW the literal wraps the hole: `arr` (`const xs: D[] = [self]`),
           `arrw` (the write spelling `xs = [self]`), `arr2` (a second, well-typed element
           beside it), `nest` (`[[self]]` into `D[][]`), `arrobj` (`[{v: self}]` into
           `Bx[]`), `objarr` (`{v: [self]}` into `{v: D[]}`). `obj` and `relay` are the two
           CONTROLS that were already loud on the base — the object literal (whose field
           recursion reads the substituted container) and the un-annotated relay (whose
           source is an Ident, so no literal recursion runs at all). They are what says the
           mechanism is the literal's element read and not the seam.
    seam   (block B) WHICH builtin argument carries the hole. Sixteen of them, over three
           receiver kinds — array, map/set, string — because the row filed "at least two"
           and the width was never measured. `aidxwr` / `midxwr` are CONTROLS: `xs[0] = self`
           and `m["k"] = self` are D572's own element/map writes and are loud on the base.
    dst    the destination's ELEMENT / VALUE type. Five, so a rep-compatible pair
           (i32 into boolean) sits in the grid beside a rep-incompatible one.
    arg    the call's argument type — what the pin binds the hole to.
    call   `g(p)` vs `p.g()`. TWO DIFFERENT PINS in `typecheck.vl`; wiring only the first
           leaves the method spelling silent beside a loud direct one, which is the
           asymmetry D401, D551 and D572 each had to fix after the fact.

THE ONE-OFF CELLS, each because a trap or a filed row moved it:

    a7arr / a7push  THE COERCION THAT MUST SURVIVE, at both rungs. `const xs: i32[] =
           [self]` and `xs.push(self)` at `g(true)` RUN and print `1` — the boolean-to-i32
           A7 coercion lives at the EXPRESSION seam, so a rung asking plain `assignable`
           instead of `assignableExpr` invents a false reject here. D551's first cut did
           exactly that.
    u8arr  THE `u8` STORAGE SLOT, which is an EXPRESSION-seam rule too: `const b: u8[] =
           [self]` at `g(200)` runs.
    brandarr  A LITERAL adopting a newtype brand through an array element
           (`const xs: A1[] = [0]`), the rule `nomLitAdopts` states. Must keep running.
    okhole THE CONTROL: `const xs: T[] = [self]` — a hole-typed destination fed the hole
           itself. Correct at every instance, so it must RUN on every seed.
    relayarr / relaypush  THE TWO-LEVEL RELAY. A generic body relaying into a SECOND
           generic substitutes the constraint's hole to ANOTHER hole, so the inner call
           cannot decide it and must re-record it under the caller. #2019 found that gate
           want-side-blind at both existing tables; a new table gets the same axis.
    forge  D571'S OWN WITNESS, reduced. It must keep RUNNING: it is the deliberate residue
           of D561 and neither rung here touches the RETURN seam.
    nulnest  D117's RECORDING. `const c: (K | null)[][] = [[null]]` — the nested niche
           element whose only rep signal is the recorded destination type. A rung that
           changes which type the element recursion reads must not move it.

TWO OF ITS THREE `deliberate` CELLS ARE NO LONGER DISAGREEING, AND THAT IS D591 CLOSING.
`d581_arr2_i32_bool_{plain,ufcs}_typar` RUN and print `1` beside a DIRECT twin that was
`check-clean invalid wasm` — the direct spelling was itself a miscompile, filed as D591 and
closed on 2026-08-29, so the twin now runs and prints `1` too. `lists.json` is a record of
what THIS grid measured against ITS base seed (`scratch-int/d581/BASE.wasm`, md5
`262dce49…`), and `--verify` re-grades against that seed, so both stay correct as written —
but do not read the `deliberate` list as a claim about today's compiler. `d581o_forge_typar`
(D571's own witness) is the one that still disagrees.

    python3 scripts/silent-sweep/d581/litgrid.py [seed.wasm]      grade to stdout
    python3 scripts/silent-sweep/d581/litgrid.py --table          by shape x dst x arg
    python3 scripts/silent-sweep/d581/litgrid.py --emit <dir>     write the cells
    python3 scripts/silent-sweep/d581/litgrid.py B.wasm --delta C.wasm
    python3 scripts/silent-sweep/d581/litgrid.py --write-lists C.wasm B.wasm [--refused S]
    python3 scripts/silent-sweep/d581/litgrid.py --verify B.wasm   (B = the BASE seed)
    python3 scripts/silent-sweep/d581/litgrid.py --price S         the landing's price
    python3 scripts/silent-sweep/d581/litgrid.py --mkset
"""
import concurrent.futures
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
VL = os.path.join(R, "scripts/vl-host/target/release/vl")
NAMED = os.path.join(R, "scripts/silent-sweep/distilled/named")
LISTS = os.path.join(HERE, "lists.json")
JOBS = int(os.environ.get("JOBS", "6"))
# The seed this landing branched from (master 0108efd0 — D572's landing, 1,500,155 bytes).
# `--price` reads it to tell "you handed me the pre-landing compiler" from "a candidate
# broke a price cell": the price cells RUN on the base too, so behaviour alone cannot
# separate the two answers and only the seed's identity can.
BASE_MD5 = "262dce49803b3d3939d09fb83e3410b8"


def seed_md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# type key -> (spelling, a literal of that type, how `print` takes a value of it, a MISS
# literal). The MISS literal is what a `?? ` fallback yields when the store never happened;
# it is deliberately DIFFERENT from the stored literal, so a read that silently missed
# cannot print the value the cell expects.
TYS = {
    "i32": ("i32", "0", "%s", "-9"),
    "str": ("string", '"s"', "%s", '"miss"'),
    "bool": ("boolean", "true", "%s", "false"),
    "f64": ("f64", "1.5", "%s", "-9.5"),
    "obj": ("V", "{ x: 7 }", "%s.x", "{ x: -9 }"),
}
ARGS = list(TYS)
DSTS = list(TYS)
SHAPES = ["arr", "arrw", "arr2", "nest", "arrobj", "objarr", "obj", "relay"]
CALLS = ["plain", "ufcs"]

# WHAT THE LANGUAGE PRINTS for a value of type `arg` arriving at a destination of type
# `dst` — only the pairs it ACCEPTS have an entry; every other pair does not run on the
# direct spelling, so it has no value to expect. `--verify` re-derives every row here from
# each cell's DIRECT TWIN on the seed under test, so a stale row FAILS rather than passing.
COERCE = {
    ("i32", "i32"): "0",
    ("i32", "f64"): "0",
    ("str", "str"): "s",
    ("bool", "bool"): "true",
    ("bool", "i32"): "1",
    ("f64", "f64"): "1.5",
    ("obj", "obj"): "7",
}

# WHAT `want_of` SAYS WHEN THE LANGUAGE ACCEPTS NO VALUE HERE — the direct spelling is a
# loud reject, so the cell has no right answer to print and anything it prints contradicts
# its own declaration. A sentinel rather than a fabricated number: an artefact must not give
# a confident answer it did not compute, and `"0"` here would have read as one. It can never
# equal stdout, so a cell that runs anyway grades `runs but wrong value`, which is what it is.
NOVALUE = "<no legitimate value — the direct spelling is a loud reject>"

INVALID = ("Invalid input WebAssembly code", "WebAssembly translation error",
           "wasm validation", "failed to parse", "failed to compile")
TRAP = ("wasm trap", "unreachable", "out of bounds", "divide by zero",
        "null reference", "cast failure", "integer overflow")
EMIT = ("emit error", "emitProgram:", "emitFail", "unsupported statement",
        "unsupported expression")


# ── BLOCK L: the LITERAL CONTAINER (D581) ─────────────────────────────────────────────
def lcell_src(shape, dst, arg, call, delivery):
    aty, alit, _pr, _ms = TYS[arg]
    dty, dlit, dpr, dmiss = TYS[dst]
    T = "T" if delivery == "typar" else aty
    gen = "<T>" if delivery == "typar" else ""
    L = ["type V = { x: i32 }"]
    sig = "self: T" if delivery == "typar" else "self: %s" % aty

    if shape == "arr":
        ret, body = dty, ["const xs: %s[] = [self]" % dty, "return xs[0]"]
    elif shape == "arrw":
        ret, body = dty, ["let xs: %s[] = [%s]" % (dty, dlit),
                          "xs = [self]", "return xs[0]"]
    elif shape == "arr2":
        ret, body = dty, ["const xs: %s[] = [%s, self]" % (dty, dlit), "return xs[1]"]
    elif shape == "nest":
        ret, body = dty, ["const xs: %s[][] = [[self]]" % dty, "return xs[0][0]"]
    elif shape == "arrobj":
        L.append("type Bx = { v: %s }" % dty)
        ret, body = dty, ["const xs: Bx[] = [{ v: self }]", "return xs[0].v"]
    elif shape == "objarr":
        L.append("type Bx2 = { v: %s[] }" % dty)
        ret, body = dty, ["const b: Bx2 = { v: [self] }", "return b.v[0]"]
    elif shape == "obj":
        L.append("type Bx3 = { v: %s }" % dty)
        ret, body = dty, ["const b: Bx3 = { v: self }", "return b.v"]
    else:  # relay — an UN-annotated binding first, so the pin sees an Ident, not a literal
        ret, body = dty, ["const tmp = [self]", "const xs: %s[] = tmp" % dty,
                          "return xs[0]"]

    L.append("function g%s(%s): %s {" % (gen, sig, ret))
    for b in body:
        L.append("  " + b)
    L.append("}")
    L.append("const p: %s = %s" % (aty, alit))
    L.append("const z = %s" % ("p.g()" if call == "ufcs" else "g(p)"))
    L.append("print(%s)" % (dpr % "z"))
    return "\n".join(L) + "\n"


def lcell_id(shape, dst, arg, call, delivery):
    return "d581_%s_%s_%s_%s_%s" % (shape, dst, arg, call, delivery)


# ── BLOCK B: the BUILTIN METHOD ARGUMENT (D582) ───────────────────────────────────────
# seam -> (extra decls, setup lines, the line USING `self`, the return TYPE, the read
#          expression, {arg key that is LEGITIMATE: the value it then prints})
# Every read is a real observation of the store / query, so a wrong value is visible.
BSEAMS = {
    "push":     ([], ["const xs: string[] = []"], "xs.push(self)",
                 "string", "xs[0]", {"str": "s"}),
    "pushpin":  ([], ['const xs = ["a"]'], "xs.push(self)",
                 "string", "xs[1]", {"str": "s"}),
    "msetv":    ([], ["const m: {[string]: string} = Map()"], 'm.set("k", self)',
                 "string", 'm.get("k") ?? "z"', {"str": "s"}),
    "msetk":    ([], ["const m: {[string]: string} = Map()"], 'm.set(self, "v")',
                 "string", "m.keys()[0]", {"str": "s"}),
    # THE READ IS INLINE, not bound to a local, and that is not a style choice: a map/array
    # `.get` whose result is BOUND (`const q = m.get(self)`) fails to EMIT on both spellings
    # ("callee is not a function name"), which would make the cell agree for a reason that
    # has nothing to do with this row.
    "mget":     ([], ["const m: {[string]: string} = Map()", 'm.set("s", "v")'],
                 "", "string", 'm.get(self) ?? "z"', {"str": "v"}),
    "mhas":     ([], ["const m: {[string]: string} = Map()", 'm.set("s", "v")'],
                 "const q = m.has(self)", "boolean", "q", {"str": "true"}),
    "mdel":     ([], ["const m: {[string]: string} = Map()", 'm.set("s", "v")'],
                 "const q = m.delete(self)", "boolean", "q", {"str": "true"}),
    "sadd":     ([], ["const st: {[string]: boolean} = Set()"], "st.add(self)",
                 "boolean", 'st.has("s")', {"str": "true"}),
    "shas":     ([], ["const st: {[string]: boolean} = Set()", 'st.add("s")'],
                 "const q = st.has(self)", "boolean", "q", {"str": "true"}),
    # An ARRAY `.get(i)` does not EMIT on any seed (the same "callee is not a function
    # name" gap, in the array's arm), so its legitimate column is `emit` on BOTH spellings.
    # It stays in the grid for the columns where it does distinguish: the CHECK arm
    # ("get: index must be i32") is a real deferred-argument seam.
    "aget":     ([], ['const xs = ["a", "b"]'], "", "string",
                 'xs.get(self) ?? "z"', {"i32": "a"}),
    "aslice":   ([], ['const xs = ["a", "b"]'], "const q = xs.slice(self)",
                 "i32", "q.length", {"i32": "2"}),
    "sindexOf": ([], [], 'const q = "abc".indexOf(self)', "i32", "q", {"str": "-1"}),
    "sincludes": ([], [], 'const q = "abc".includes(self)', "boolean", "q",
                  {"str": "false"}),
    "scharCodeAt": ([], [], 'const q = "abc".charCodeAt(self)', "i32", "q",
                    {"i32": "97"}),
    "sslice":   ([], [], 'const q = "abc".slice(self, 2)', "string", "q", {"i32": "ab"}),
    "scpAt":    ([], [], 'const q = "abc".cpAt(self)', "i32", "q", {"i32": "97"}),
    "sisCB":    ([], [], 'const q = "abc".isCharBoundary(self)', "boolean", "q",
                 {"i32": "true"}),
    # THE TWO CONTROLS: D572's own element and map writes, loud on the base seed.
    "aidxwr":   ([], ['const xs: string[] = ["a"]'], "xs[0] = self",
                 "string", "xs[0]", {"str": "s"}),
    "midxwr":   ([], ["const m: {[string]: string} = Map()"], 'm["k"] = self',
                 "string", 'm.get("k") ?? "z"', {"str": "s"}),
}
BSEAMNAMES = list(BSEAMS)


def bcell_src(seam, arg, call, delivery):
    decls, setup, use, ret, read, _ok = BSEAMS[seam]
    aty, alit, _pr, _ms = TYS[arg]
    T = "T" if delivery == "typar" else aty
    gen = "<T>" if delivery == "typar" else ""
    L = ["type V = { x: i32 }"] + list(decls)
    L.append("function g%s(self: %s): %s {" % (gen, T, ret))
    for s in setup:
        L.append("  " + s)
    if use != "":
        L.append("  " + use)
    L.append("  return " + read)
    L.append("}")
    L.append("const p: %s = %s" % (aty, alit))
    L.append("const z = %s" % ("p.g()" if call == "ufcs" else "g(p)"))
    L.append("print(z)")
    return "\n".join(L) + "\n"


def bcell_id(seam, arg, call, delivery):
    return "d582_%s_%s_%s_%s" % (seam, arg, call, delivery)


# ── BLOCK S: the two STORE seams over a destination-type axis ─────────────────────────
# `push` and `m.set`'s VALUE are the two positions that put a wrongly-typed value INTO a
# typed container, so they get the same five-way destination axis block L has: a
# rep-compatible pair (i32 into boolean) has to sit beside a rep-incompatible one.
SSEAMS = ["spush", "smsetv"]


def scell_src(seam, dst, arg, call, delivery):
    aty, alit, _pr, _ms = TYS[arg]
    dty, dlit, dpr, dmiss = TYS[dst]
    T = "T" if delivery == "typar" else aty
    gen = "<T>" if delivery == "typar" else ""
    L = ["type V = { x: i32 }"]
    L.append("function g%s(self: %s): %s {" % (gen, T, dty))
    if seam == "spush":
        L.append("  const xs: %s[] = []" % dty)
        L.append("  xs.push(self)")
        L.append("  return xs[0]")
    else:
        L.append("  const m: {[string]: %s} = Map()" % dty)
        L.append('  m.set("k", self)')
        L.append('  const q = m.get("k")')
        L.append("  return q ?? %s" % dmiss)
    L.append("}")
    L.append("const p: %s = %s" % (aty, alit))
    L.append("const z = %s" % ("p.g()" if call == "ufcs" else "g(p)"))
    L.append("print(%s)" % (dpr % "z"))
    return "\n".join(L) + "\n"


def scell_id(seam, dst, arg, call, delivery):
    return "d582s_%s_%s_%s_%s_%s" % (seam, dst, arg, call, delivery)


# ── THE ONE-OFF CELLS ─────────────────────────────────────────────────────────────────
def _g(sig_ty, ret, body, callarg, pr="z"):
    def mk(delivery):
        T = "T" if delivery == "typar" else sig_ty
        gen = "<T>" if delivery == "typar" else ""
        L = ["function g%s(self: %s): %s {" % (gen, T, ret)]
        L += ["  " + b for b in body]
        L.append("}")
        L.append("const z = g(%s)" % callarg)
        L.append("print(%s)" % pr)
        return "\n".join(L) + "\n"
    return mk


# The A7 coercion at both rungs. Both RUN on every seed; a rung asking plain `assignable`
# instead of `assignableExpr` invents a false reject here.
a7arr_src = _g("boolean", "i32", ["const xs: i32[] = [self]", "return xs[0]"], "true")
a7push_src = _g("boolean", "i32",
                ["const xs: i32[] = []", "xs.push(self)", "return xs[0]"], "true")
# The `u8` STORAGE SLOT — an i32 VALUE into a one-byte element, the documented truncation.
u8arr_src = _g("i32", "i32", ["const b: u8[] = [self]", "return b[0]"], "200")
u8push_src = _g("i32", "i32",
                ["const b: u8[] = []", "b.push(self)", "return b[0]"], "200")


# A LITERAL adopting a newtype brand through an ARRAY ELEMENT. `nomLitAdopts` is the rule;
# it must survive both rungs.
def brandarr_src(delivery):
    T = "T" if delivery == "typar" else "i32"
    gen = "<T>" if delivery == "typar" else ""
    return "\n".join([
        "type A1 = new i32",
        "function g%s(self: %s): A1 {" % (gen, T),
        "  const xs: A1[] = [0, 1]",
        "  return xs[0]",
        "}",
        "print(g(5) as i32)",
    ]) + "\n"


# THE CONTROL: a hole-typed destination fed the hole itself, through the literal.
def okhole_src(delivery):
    T = "T" if delivery == "typar" else "string"
    gen = "<T>" if delivery == "typar" else ""
    return "\n".join([
        "function g%s(self: %s): %s {" % (gen, T, T),
        "  const xs: %s[] = [self]" % T,
        "  return xs[0]",
        "}",
        'print(g("s"))',
    ]) + "\n"


def okholepush_src(delivery):
    T = "T" if delivery == "typar" else "string"
    gen = "<T>" if delivery == "typar" else ""
    return "\n".join([
        "function g%s(self: %s): %s {" % (gen, T, T),
        "  const xs: %s[] = []" % T,
        "  xs.push(self)",
        "  return xs[0]",
        "}",
        'print(g("s"))',
    ]) + "\n"


# THE TWO-LEVEL RELAY, at each rung. `inner<T>` reached through `outer<U>` substitutes the
# constraint's hole to ANOTHER hole; the re-deferral gate has to carry it, and #2019 found
# that gate want-side-blind at both existing tables.
def relayarr_src(delivery):
    isig = "<T>(self: T)" if delivery == "typar" else "(self: i32)"
    osig = "<U>(self: U)" if delivery == "typar" else "(self: i32)"
    return "\n".join([
        "function inner%s: string {" % isig,
        "  const xs: string[] = [self]",
        "  return xs[0]",
        "}",
        "function outer%s: string { return inner(self) }" % osig,
        "print(outer(0))",
    ]) + "\n"


def relaypush_src(delivery):
    isig = "<T>(self: T)" if delivery == "typar" else "(self: i32)"
    osig = "<U>(self: U)" if delivery == "typar" else "(self: i32)"
    return "\n".join([
        "function inner%s: string {" % isig,
        "  const xs: string[] = []",
        "  xs.push(self)",
        "  return xs[0]",
        "}",
        "function outer%s: string { return inner(self) }" % osig,
        "print(outer(0))",
    ]) + "\n"


# THE WANT-SIDE RELAY: the hole is on the DESTINATION side, relayed one level. The gate
# #2019 fixed at `validateRetCstrs`/`validateLetCstrs` was blind to exactly this shape.
def relaywant_src(delivery):
    isig = "<T>(self: T, v: i32)" if delivery == "typar" else "(self: string, v: i32)"
    osig = "<U>(self: U, v: i32)" if delivery == "typar" else "(self: string, v: i32)"
    ity = "T" if delivery == "typar" else "string"
    return "\n".join([
        "function inner%s: %s {" % (isig, ity),
        "  const xs: %s[] = [v]" % ity,
        "  return xs[0]",
        "}",
        "function outer%s: %s { return inner(self, v) }"
        % (osig, "U" if delivery == "typar" else "string"),
        'print(outer("s", 1))',
    ]) + "\n"


# D571's WITNESS: the RETURN seam's deliberate residue. Neither rung touches that seam, so
# it must keep RUNNING.
def forge_src(delivery):
    sig = "<T>(a: T, n: i32)" if delivery == "typar" else "(a: TVAddr, n: i32)"
    ty = "T" if delivery == "typar" else "TVAddr"
    return "\n".join([
        "type TVAddr = new i32",
        "function bump%s: %s { return n + 1 }" % (sig, ty),
        "const addr: TVAddr = 0",
        "print(bump(addr, 2) as i32)",
    ]) + "\n"


# D117's RECORDING: a NESTED niche element whose only rep signal is the recorded
# destination type, reached through the same array-literal element recursion R1 edits.
def nulnest_src(delivery):
    T = "T" if delivery == "typar" else "i32"
    gen = "<T>" if delivery == "typar" else ""
    return "\n".join([
        'type K = "a" | "b"',
        "function g%s(self: %s): i32 {" % (gen, T),
        "  const c: (K | null)[][] = [[null]]",
        "  return c.length",
        "}",
        "print(g(0))",
    ]) + "\n"


# THE LITERAL-UNION ATOM LIST through a generic body — the other consumer of the same
# element recursion (`recordElemRepArrayLit`'s string-destination arm).
def litunion_src(delivery):
    T = "T" if delivery == "typar" else "i32"
    gen = "<T>" if delivery == "typar" else ""
    return "\n".join([
        'type VK = "aa" | "bb"',
        "function g%s(self: %s): string {" % (gen, T),
        '  const k: VK = "aa"',
        "  const ys: string[] = [k]",
        "  return ys[0]",
        "}",
        "print(g(0))",
    ]) + "\n"


# THE MIRROR OF BOTH ROWS: the hole is on the DESTINATION side and the value is concrete.
# `function g<T>(xs: T[], v: i32)` pushing / storing an i32 into the hole-typed element.
def mirrorarr_src(delivery):
    sig = "<T>(xs: T[], v: i32)" if delivery == "typar" else "(xs: string[], v: i32)"
    ty = "T" if delivery == "typar" else "string"
    return "\n".join([
        "function g%s: %s {" % (sig, ty),
        "  const ys: %s[] = [v]" % ty,
        "  return ys[0]",
        "}",
        'const zs: string[] = ["a"]',
        "print(g(zs, 1))",
    ]) + "\n"


def mirrorpush_src(delivery):
    sig = "<T>(xs: T[], v: i32)" if delivery == "typar" else "(xs: string[], v: i32)"
    ty = "T" if delivery == "typar" else "string"
    return "\n".join([
        "function g%s: %s {" % (sig, ty),
        "  xs.push(v)",
        "  return xs[0]",
        "}",
        'const zs: string[] = ["a"]',
        "print(g(zs, 1))",
    ]) + "\n"


# id stem -> (source builder, the value it prints when it runs). `cells()` and `want_of`
# read the SAME table, so a new one-off cannot reach one without the other.
ONEOFFS = {
    "a7arr": (a7arr_src, "1"),
    "a7push": (a7push_src, "1"),
    "u8arr": (u8arr_src, "200"),
    "u8push": (u8push_src, "200"),
    "brandarr": (brandarr_src, "0"),
    "okhole": (okhole_src, "s"),
    "okholepush": (okholepush_src, "s"),
    "relayarr": (relayarr_src, NOVALUE),
    "relaypush": (relaypush_src, NOVALUE),
    "relaywant": (relaywant_src, NOVALUE),
    "forge": (forge_src, "3"),
    "nulnest": (nulnest_src, "1"),
    "litunion": (litunion_src, "aa"),
    "mirrorarr": (mirrorarr_src, NOVALUE),
    "mirrorpush": (mirrorpush_src, NOVALUE),
}


def cells():
    out = {}
    for d in ("typar", "direct"):
        for shape in SHAPES:
            for dst in DSTS:
                for arg in ARGS:
                    for call in CALLS:
                        out[lcell_id(shape, dst, arg, call, d)] = \
                            lcell_src(shape, dst, arg, call, d)
        for seam in BSEAMNAMES:
            for arg in ARGS:
                for call in CALLS:
                    out[bcell_id(seam, arg, call, d)] = bcell_src(seam, arg, call, d)
        for seam in SSEAMS:
            for dst in DSTS:
                for arg in ARGS:
                    for call in CALLS:
                        out[scell_id(seam, dst, arg, call, d)] = \
                            scell_src(seam, dst, arg, call, d)
        for nm, (mk, _v) in ONEOFFS.items():
            out["d581o_%s_%s" % (nm, d)] = mk(d)
    return out


def twin(cid):
    """The DIRECT twin — the same program with the type parameter written out as the
    argument's own type, and NOTHING else changed."""
    assert cid.endswith("_typar"), cid
    return cid[: -len("_typar")] + "_direct"


def want_of(cid):
    """The stdout a cell produces WHEN IT RUNS, read off its own axes rather than off a
    stored verdict. Never consulted for a cell that is not `runs`."""
    if cid.startswith("d581o_"):
        for nm, (_mk, v) in ONEOFFS.items():
            if cid.startswith("d581o_%s_" % nm):
                return v
        raise KeyError(cid)
    p = cid.split("_")
    if p[0] == "d581":
        _, _shape, dst, arg, _call, _d = p
        return COERCE.get((arg, dst), NOVALUE)
    if p[0] == "d582":
        _, seam, arg, _call, _d = p
        return BSEAMS[seam][5].get(arg, NOVALUE)
    _, seam, dst, arg, _call, _d = p
    return COERCE.get((arg, dst), NOVALUE)


def grade_one(args):
    src, seed = args
    with tempfile.NamedTemporaryFile("w", suffix=".vl", delete=False, dir="/tmp") as f:
        f.write(src)
        p = f.name
    try:
        c = subprocess.run([VL, "check", p, "--compiler", seed],
                           capture_output=True, text=True, timeout=180)
        cout = c.stdout + c.stderr
        errs = [ln for ln in cout.splitlines() if ln.startswith("[ERROR]")]
        if errs or c.returncode != 0:
            return ("check", (errs or [cout.strip()])[0].replace(p, "").strip())
        r = subprocess.run([VL, "run", p, "--compiler", seed],
                           capture_output=True, text=True, timeout=180)
        if r.returncode == 0:
            return ("runs", r.stdout.strip().replace("\n", "|"))
        e = (r.stderr + r.stdout).replace(p, "")
        if any(m in e for m in EMIT):
            return ("emit", " ".join(e.split())[:200])
        if any(m in e for m in INVALID):
            return ("invalid", " ".join(e.split())[:200])
        if any(m in e for m in TRAP):
            return ("trap", " ".join(e.split())[:200])
        return ("other", " ".join(e.split())[:200])
    except subprocess.TimeoutExpired:
        return ("other", "TIMEOUT")
    finally:
        os.unlink(p)


def grade_all(seed, cs=None):
    cs = cs if cs is not None else cells()
    with concurrent.futures.ThreadPoolExecutor(max_workers=JOBS) as ex:
        fut = {ex.submit(grade_one, (cs[n], seed)): n for n in cs}
        got = {fut[f]: f.result() for f in concurrent.futures.as_completed(fut)}
    return {n: {"class": got[n][0], "msg": got[n][1]} for n in cs}


def agreement(base):
    """agree / DISAGREE against the DIRECT twin, VALUE INCLUDED. A `runs` cell whose value
    differs from its twin's is a DISAGREE here, which is half the reason this grid exists."""
    out = {}
    for n, v in base.items():
        if n.endswith("_direct"):
            continue
        t = base[twin(n)]
        ok = v["class"] == t["class"]
        if ok and v["class"] == "runs":
            ok = v["msg"] == t["msg"]
        out[n] = "agree" if ok else "DISAGREE"
    return out


def wrongvalue(g):
    """Cells that RUN and print something their own declaration contradicts — the outcome a
    grid that never prints the result cannot have."""
    return sorted(n for n, v in g.items()
                  if v["class"] == "runs" and v["msg"] != want_of(n))


def load_lists():
    return json.load(open(LISTS)) if os.path.exists(LISTS) else {}


def named_set(L):
    return sorted(set(L.get("fix", []) + L.get("price", []) + L.get("control", [])
                      + L.get("residue", []) + L.get("refute", [])
                      + L.get("deliberate", [])))


def require(name, rows):
    """A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY (#2011). Every scored list goes
    through this: an absent or empty ledger is a FAILURE, not three green zeroes."""
    if not rows:
        print("%s: EMPTY POPULATION -- the ledger lists no cells, so nothing was "
              "verified. This is a FAILURE, not a pass." % name)
        return False
    return True


def main():
    seed = os.path.join(R, "build/vl-compiler.wasm")
    args = sys.argv[1:]
    takes_value = ("--delta", "--write-lists", "--emit", "--refused")
    for i, a in enumerate(args):
        if a.startswith("-") or not a.endswith(".wasm"):
            continue
        if i > 0 and args[i - 1] in takes_value:
            continue
        seed = a
        break
    cs = cells()

    if "--emit" in sys.argv:
        d = sys.argv[sys.argv.index("--emit") + 1]
        os.makedirs(d, exist_ok=True)
        for n, s in cs.items():
            open(os.path.join(d, n + ".vl"), "w").write(s)
        print("wrote %d cells to %s" % (len(cs), d))
        return 0

    if "--mkset" in sys.argv:
        # Materialise the named set into `distilled/named/`, cells AND twins, plus the
        # `expect` rows the census grader reads — a value-graded cell with no expectation
        # would be scored on any output at all, which is the blindness this grid removes.
        L = load_lists()
        want = named_set(L)
        if not require("named/", want):
            return 1
        man = os.path.join(NAMED, "manifest.json")
        M = json.load(open(man))
        n = 0
        for c in want:
            for m in (c, twin(c)):
                open(os.path.join(NAMED, m + ".vl"), "w").write(cs[m])
                M["expect"][m] = want_of(m)
                n += 1
        json.dump(M, open(man, "w"), indent=1, sort_keys=True)
        print("wrote %d cells (+twins) into %s and their expectations into manifest.json"
              % (n, NAMED))
        return 0

    base = grade_all(seed, cs)
    agr = agreement(base)
    L = load_lists()

    if "--write-lists" in sys.argv:
        cand = sys.argv[sys.argv.index("--write-lists") + 1]
        after = grade_all(cand, cs)
        aft_agr = agreement(after)
        moved = sorted(n for n in base
                       if (base[n]["class"], base[n]["msg"]) !=
                          (after[n]["class"], after[n]["msg"]))
        fix = [n for n in moved if n.endswith("_typar")]
        control = sorted(n for n, g in agr.items()
                         if g == "agree" and base[n]["class"] == "runs"
                         and after[n]["class"] == "runs")
        SILENT = ("invalid", "trap", "emit")
        refused = [sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--refused"]
        # THE LANDING'S OWN PRICE: cells that RAN on the base and are a loud reject now.
        # Nothing was refused here — the landing OVERRIDES — so the payment term is
        # `d572/letgrid.py`'s and not `d551/retgrid.py`'s: each must STILL be a reject and
        # must AGREE with its one-token-different direct twin.
        price = sorted(n for n in cs
                       if n.endswith("_typar") and base[n]["class"] == "runs"
                       and after[n]["class"] != "runs")
        whopaid = {"the landing itself (overridden, not refused)": price}
        REFGRADE = {rs: grade_all(rs, cs) for rs in refused}
        for rs in refused:
            rg = REFGRADE[rs]
            for n in cs:
                if not n.endswith("_typar"):
                    continue
                worse = base[n]["class"] == "runs" and rg[n]["class"] != "runs"
                if worse and after[n]["class"] == "runs":
                    whopaid.setdefault(os.path.basename(rs), []).append(n)
        # REFUTE: cells a refused candidate made worse IN THE OTHER DIRECTION — a loud
        # reject on the base AND on the landing that the candidate turned into a `runs`.
        # `price` counts a LOST `runs` and is structurally blind to an INVENTED one.
        refute = set()
        for rs in refused:
            rg = REFGRADE[rs]
            for n in cs:
                if not n.endswith("_typar"):
                    continue
                if base[n]["class"] == "check" and after[n]["class"] == "check":
                    if agr[n] == "agree" and rg[n]["class"] == "runs":
                        refute.add(n)
                        whopaid.setdefault(os.path.basename(rs) + " (invented a runs)",
                                           []).append(n)
        deliberate = sorted(n for n in cs
                            if n.endswith("_typar") and base[n]["class"] == "runs"
                            and after[n]["class"] == "runs"
                            and aft_agr.get(n) == "DISAGREE")
        residue = sorted(n for n in cs
                         if n.endswith("_typar") and after[n]["class"] in SILENT
                         and after[twin(n)]["class"] in ("check",))
        out = {"base_seed": os.path.basename(seed),
               "cand_seed": os.path.basename(cand),
               "refused": {k: sorted(v) for k, v in whopaid.items()},
               "fix": fix,
               "price": price,
               "refute": sorted(refute),
               "deliberate": deliberate,
               "residue": residue,
               "control": control}
        json.dump(out, open(LISTS, "w"), indent=1, sort_keys=True)
        print("wrote %d fix + %d price + %d refute + %d deliberate (from %d refused "
              "candidates) + %d residue + %d control to %s"
              % (len(fix), len(price), len(refute), len(deliberate), len(refused),
                 len(residue), len(control), LISTS))
        return 0

    if "--delta" in sys.argv:
        # ARGUMENT ORDER: the positional seed is the BASE, `--delta` takes the AFTER seed.
        # Reversed, a landing's fixes read as regressions — which has happened.
        other = sys.argv[sys.argv.index("--delta") + 1]
        after = grade_all(other, cs)
        SILENT = ("invalid", "trap", "emit")
        moved = [n for n in sorted(base)
                 if (base[n]["class"], base[n]["msg"]) !=
                    (after[n]["class"], after[n]["msg"])]
        lost = [n for n in moved if base[n]["class"] == "runs"
                and after[n]["class"] != "runs"]
        gained = [n for n in moved if base[n]["class"] != "runs"
                  and after[n]["class"] == "runs"]
        silent = [n for n in moved if base[n]["class"] not in SILENT
                  and after[n]["class"] in SILENT]
        wv_b, wv_a = set(wrongvalue(base)), set(wrongvalue(after))
        dis_b = sum(1 for g in agr.values() if g == "DISAGREE")
        dis_a = sum(1 for g in agreement(after).values() if g == "DISAGREE")
        print("%s (base) -> %s (after)"
              % (os.path.basename(seed), os.path.basename(other)))
        print("  moved         %4d of %d" % (len(moved), len(base)))
        print("  -> runs       %4d" % len(gained))
        print("  runs LOST     %4d" % len(lost))
        print("  -> silent     %4d" % len(silent))
        print("  -> WRONG VALUE%4d   (was %d, now %d)"
              % (len(wv_a - wv_b), len(wv_b), len(wv_a)))
        print("  wrong value FIXED %d" % len(wv_b - wv_a))
        print("  DISAGREE with the direct twin: %d -> %d" % (dis_b, dis_a))
        pairs = {}
        for n in moved:
            pairs[(base[n]["class"], after[n]["class"])] = \
                pairs.get((base[n]["class"], after[n]["class"]), 0) + 1
        for (x, y), c in sorted(pairs.items(), key=lambda t: -t[1]):
            print("    %-8s -> %-8s %4d" % (x, y, c))
        for lbl, rows in (("runs LOST", lost), ("-> silent", silent),
                          ("-> WRONG VALUE", sorted(wv_a - wv_b))):
            for n in rows[:24]:
                print("  %-14s %s   %s" % (lbl, n, after[n]["msg"][:60]))
        return 0

    if "--table" in sys.argv:
        for call in CALLS:
            print("== BLOCK L (literal container): pin/direct by shape x dst x arg  "
                  "(call=%s)" % call)
            print("%-16s %s" % ("shape/dst", " ".join("%-16s" % a for a in ARGS)))
            for shape in SHAPES:
                for dst in DSTS:
                    row = []
                    for arg in ARGS:
                        n = lcell_id(shape, dst, arg, call, "typar")
                        row.append("%-16s" % ("%s/%s" % (base[n]["class"],
                                                         base[twin(n)]["class"])))
                    print("%-16s %s" % ("%s/%s" % (shape, dst), " ".join(row)))
            print()
        print("== BLOCK B (builtin argument): pin/direct by seam x arg  (call=plain)")
        print("%-16s %s" % ("seam", " ".join("%-16s" % a for a in ARGS)))
        for seam in BSEAMNAMES:
            row = []
            for arg in ARGS:
                n = bcell_id(seam, arg, "plain", "typar")
                row.append("%-16s" % ("%s/%s" % (base[n]["class"],
                                                 base[twin(n)]["class"])))
            print("%-16s %s" % (seam, " ".join(row)))
        print()
        print("== the one-off cells")
        for nm in ONEOFFS:
            n = "d581o_%s_typar" % nm
            print("  %-12s %s/%s   pin printed %r"
                  % (nm, base[n]["class"], base[twin(n)]["class"], base[n]["msg"][:24]))
        nd = sum(1 for g in agr.values() if g == "DISAGREE")
        wv = wrongvalue(base)
        print("\n%d of %d pinned cells DISAGREE with their direct twin" % (nd, len(agr)))
        print("%d of %d cells RUN and print a value their declaration contradicts"
              % (len(wv), len(base)))
        for n in wv[:20]:
            print("   WRONG VALUE %s  want %s got %s" % (n, want_of(n), base[n]["msg"]))
        return 0

    if "--verify" in sys.argv:
        # (1) THE DISTINGUISHING RULE, mechanised: every cell in `fix` must DISAGREE with
        #     its direct twin on the BASE seed, so its expected answer differs from the
        #     answer it would give if the rungs under test did nothing. `--verify`
        #     therefore TAKES THE BASE SEED.
        # (2) A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY.
        # (3) Nothing here is a cached verdict: the closed-form tables in this file
        #     (`COERCE` and each seam's `ok` map, read by `want_of`) are re-derived from
        #     each cell's DIRECT TWIN below, so a stale row fails rather than passing.
        rc = 0
        fix = L.get("fix", [])
        if not require("distinguishing", fix):
            rc = 1
        blind = [n for n in fix if agr.get(n) == "agree"]
        for n in blind[:20]:
            print("BLIND (pin already gives the direct twin's answer): %s" % n)
        print("distinguishing: %d of %d fix cells blind" % (len(blind), len(fix)))
        if blind:
            rc = 1
        ctl = L.get("control", [])
        if not require("control", ctl):
            rc = 1
        badctl = [n for n in ctl if agr.get(n) != "agree" or base[n]["class"] != "runs"]
        for n in badctl[:20]:
            print("BAD CONTROL (not an agreeing `runs` on the base seed): %s  %s/%s"
                  % (n, base[n]["class"], agr.get(n)))
        print("control: %d of %d controls are not agreeing `runs`" % (len(badctl), len(ctl)))
        if badctl:
            rc = 1
        # THE EXPECTATION TABLE, RE-DERIVED FROM THE LANGUAGE — over the cells where BOTH
        # spellings run, which is where the language itself endorses the value. Over all
        # `runs` cells it would instead be asserting the base seed is clean, and it is not:
        # that is the defect.
        endorsed = [n for n, v in base.items() if v["class"] == "runs"
                    and (n.endswith("_direct") or agr.get(n) == "agree")]
        if not require("expectations", endorsed):
            rc = 1
        badexp = [(n, want_of(n), base[n]["msg"]) for n in endorsed
                  if base[n]["msg"] != want_of(n)]
        for n, w, g in badexp[:20]:
            print("EXPECTATION WRONG: %s  want_of says %r, the compiler printed %r"
                  % (n, w, g))
        print("expectations: %d of %d twin-endorsed `runs` cells print something want_of "
              "does not predict" % (len(badexp), len(endorsed)))
        if badexp:
            rc = 1
        nov = [n for n in endorsed if want_of(n) == NOVALUE]
        for n in nov[:20]:
            print("SENTINEL ON AN ACCEPTED PAIR: %s runs on both spellings, so `NOVALUE` "
                  "is the wrong expectation for it" % n)
        print("sentinel: %d of %d twin-endorsed `runs` cells are marked as having no "
              "legitimate value" % (len(nov), len(endorsed)))
        if nov:
            rc = 1
        # THE REFUSED CANDIDATE'S PRICE, which is what a refusal has to keep executable.
        # `REFUSED.wasm` is the third rung written the OTHER way — reconstructing the union
        # the array literal's element join dropped and recording it as the CONTAINER's type
        # instead of per SLOT. It buys the same cells and costs two that RUN CORRECTLY, so
        # the payment term here is the reverse of `price`'s: each of these must still RUN.
        cand_prices = {k: v for k, v in L.get("refused", {}).items()
                       if not k.startswith("the landing itself")}
        if cand_prices:
            for k, rows in cand_prices.items():
                if not require("refused/%s" % k, rows):
                    rc = 1
                    continue
                stopped = [n for n in rows if base[n]["class"] != "runs"]
                for n in stopped[:20]:
                    print("REFUSED-CANDIDATE PRICE CELL NO LONGER RUNS: %s is %s on this "
                          "seed, so the reason that candidate was refused has evaporated "
                          "— re-derive it rather than trusting the ledger"
                          % (n, base[n]["class"]))
                print("refused/%s: %d cells it would have cost, %d no longer running"
                      % (k, len(rows), len(stopped)))
                if stopped:
                    rc = 1
        # REFUTE — cells a refused candidate turned from a loud reject into a `runs`, which
        # `price` structurally cannot see. It is EMPTY here for a recorded reason rather than
        # by omission: `REFUSED.wasm`'s cost is entirely one-directional (it takes `runs`
        # away, it invents none), and the list above is the non-empty population that says so.
        ref = L.get("refute", [])
        if ref:
            badref = [n for n in ref
                      if base[n]["class"] != "check" or agr.get(n) != "agree"]
            for n in badref[:20]:
                print("REFUTATION CELL MOVED (must be an agreeing loud reject): %s  %s/%s"
                      % (n, base[n]["class"], agr.get(n)))
            print("refute: %d of %d refutation cells are not agreeing loud rejects"
                  % (len(badref), len(ref)))
            if badref:
                rc = 1
        elif cand_prices:
            print("refute: EMPTY, AND MEASURED — the %d refused candidate(s) above cost "
                  "`runs` cells and invented none, so there is no reject-turned-`runs` to "
                  "re-ask. Their own price list is the population that was scored."
                  % len(cand_prices))
        else:
            print("refute: NOT APPLICABLE — `lists.json` records no refused candidate, so "
                  "there is no population to re-ask. This becomes a required check the "
                  "moment one is recorded.")
        dlb = L.get("deliberate", [])
        if dlb:
            baddlb = [n for n in dlb
                      if base[n]["class"] != "runs" or agr.get(n) != "DISAGREE"]
            for n in baddlb[:20]:
                print("DELIBERATE CELL MOVED (must be a DISAGREEING `runs`): %s  %s/%s"
                      % (n, base[n]["class"], agr.get(n)))
            print("deliberate: %d of %d exempted cells are not disagreeing `runs`"
                  % (len(baddlb), len(dlb)))
            if baddlb:
                rc = 1
        else:
            print("deliberate: EMPTY BY CONSTRUCTION — this landing exempts nothing, so "
                  "every cell that still runs beside a loud twin would be RESIDUE, which "
                  "`--price`'s (b) term and the `residue` list both score.")
        want = named_set(L)
        if not require("named/", want):
            rc = 1
        man = json.load(open(os.path.join(NAMED, "manifest.json")))
        miss = bad = noexp = 0
        for n in want:
            for m in (n, twin(n)):
                p = os.path.join(NAMED, m + ".vl")
                if not os.path.exists(p):
                    miss += 1
                    print("MISSING FROM named/: %s" % m)
                elif open(p).read() != cs[m]:
                    bad += 1
                    print("DIFFERS FROM named/: %s" % m)
                if man["expect"].get(m) != want_of(m):
                    noexp += 1
                    print("NO/WRONG EXPECTATION in named/manifest.json: %s (want %s, "
                          "manifest says %r)" % (m, want_of(m), man["expect"].get(m)))
        print("named/: %d cells + twins expected, %d missing, %d differ, %d without the "
              "right expectation" % (len(want), miss, bad, noexp))
        if miss or bad or noexp:
            rc = 1
        print("verify: %s" % ("OK" if rc == 0 else "FAILED"))
        return rc

    if "--price" in sys.argv:
        # THE LANDING'S OWN PRICE, EXECUTABLE. These cells RAN on the base and are a loud
        # reject now, so each must STILL be a reject and must AGREE with its
        # one-token-different direct twin — which is the whole justification for having
        # taken it. A cell that starts running again is a silent re-opening.
        price = L.get("price", [])
        if not require("price", price):
            return 1
        missing = [n for n in price
                   if not os.path.exists(os.path.join(NAMED, n + ".vl"))]
        if missing:
            print("price: %d cells are MISSING from named/ (%s...) — the population this "
                  "check is about does not exist. FAILURE." % (len(missing), missing[0]))
            return 1
        # WRONG SEED IS A DISTINCT ANSWER FROM VETO, and it is decided by the seed's own
        # IDENTITY before anything is graded. On the base every one of these cells RUNS, so
        # "they all fail" IS this file's wrong-seed signature — and reporting that as a veto
        # would read as "the landing broke N cells" when it means "you handed me the
        # pre-landing compiler". An md5 says which compiler this was; behaviour cannot.
        if BASE_MD5 == seed_md5(seed):
            print("price cells: %d   seed %s (md5 %s)"
                  % (len(price), os.path.basename(seed), seed_md5(seed)))
            print("price: this IS the base seed (0108efd0, md5 %s), where every one of "
                  "these cells RUNS — that is the defect, not the landing. Re-run against "
                  "build/vl-compiler.wasm from this branch." % BASE_MD5)
            return 2
        bad_a, bad_b = [], []
        for n in price:
            v = base[n]
            if v["class"] == "runs":
                bad_a.append((n, "RUNS AGAIN", v["msg"][:40]))
            elif agr.get(n) != "agree":
                bad_b.append((n, v["class"], base[twin(n)]["class"]))
        print("price cells: %d   seed %s (md5 %s)"
              % (len(price), os.path.basename(seed), seed_md5(seed)))
        print("  (a) still a REJECT                : %d fail" % len(bad_a))
        print("  (b) agrees with its DIRECT twin   : %d fail" % len(bad_b))
        for lbl, rows in (("RE-OPENED", bad_a), ("DISAGREES WITH ITS TWIN", bad_b)):
            for r in rows[:10]:
                print("  %s %s" % (lbl, r))
        ok = not (bad_a or bad_b)
        print("price: %s" % ("held — every cell this landing took is still a loud reject "
                             "that says what its direct spelling says"
                             if ok else "VETO"))
        return 0 if ok else 1

    nd = sum(1 for g in agr.values() if g == "DISAGREE")
    wv = wrongvalue(base)
    counts = {}
    for v in base.values():
        counts[v["class"]] = counts.get(v["class"], 0) + 1
    print("seed %s (md5 %s)   %d cells"
          % (os.path.basename(seed), seed_md5(seed), len(base)))
    for k in sorted(counts):
        print("  %-8s %4d" % (k, counts[k]))
    print("  %d of %d pinned cells DISAGREE with their direct twin" % (nd, len(agr)))
    print("  %d cells RUN and print a value their declaration contradicts" % len(wv))
    return 0


if __name__ == "__main__":
    sys.exit(main())
