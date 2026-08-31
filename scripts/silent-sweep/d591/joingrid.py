#!/usr/bin/env python3
"""D591 / D592 — the two rows #2020's grid left in its DIRECT column, graded BY VALUE
against a twin the language itself endorses.

THE QUESTION, and why it is not #2020's. That PR closed two PIN seams (a value landing in a
literal container inside a generic body; a builtin method's argument). Both rows here sit on
the other side of the check/emit line: `vl check` is rc 0 AND CORRECT, and what disagrees
with it is the REP the emitter builds.

    D591  a NON-generic array literal whose elements JOIN to a union the destination does
          not have (`const xs: i32[] = [0, b]`, `b: boolean`). `checkArrayLitNode` joins to
          `i32 | boolean`, so `assignable((i32|boolean)[], i32[])` is false;
          `assignableExpr`'s array-literal recursion then accepts the literal ELEMENT-WISE
          (each element fits on its own — `0` is an i32, `b` takes the A7 coercion) and the
          BINDING correctly types `i32[]`. The LITERAL NODE keeps the joined type, and
          `nodeArrayElemName`'s TyUnion arm claims the kind-2 BOX list for it, so the
          emitter builds `(ref null $box)[]` into an `i32[]` slot.
    D592  an UN-ANNOTATED return whose value is read out of a hole-typed local
          (`const xs: T[] = [self]; return xs[0]`). The checker resolves the call to
          `string` — a wrong-typed binding says `cannot assign string to 'z' of type i32` —
          and the monomorphized INSTANCE is emitted `(result i32)` while its body returns a
          `(ref $string)`. `monoMakeInstance` substitutes the type argument into the return
          ONLY when an annotation exists; the un-annotated ladder below it is a per-shape
          whitelist whose `Index` arm covers PARAMS pinned to `f64[]` and nothing else.

EVERY CELL SHIPS WITH A TWIN THE LANGUAGE ENDORSES, differing in exactly one thing:

    block J (D591)  the twin is the SAME shape and destination with the READ element ALONE
                    (`const xs: i32[] = [b]` for `const xs: i32[] = [a, b]` read at 1). So
                    the expected value is the language's own answer for that element in
                    that slot, and a two-element literal that disagrees with its own
                    one-element spelling is disagreeing with the compiler, not with me.
    block R (D592)  the twin is the same body with the return DECLARED (`: T`). One token.

GRADED BY VALUE, with a SENTINEL and never a fabricated default. This family has cost four
grids exactly that way (#2016, #2018, #2019, #2020): the worst cell is not a reject and not
invalid wasm but a program that VALIDATES and prints a value its own declaration
contradicts, and a grid that prints a constant cannot see it. `want_of` returns NOVALUE
wherever the language accepts no value at the position, so a cell that runs anyway grades
`runs but wrong value`, which is what it is.

THE AXES:

    block J   dst   the destination ELEMENT type. Ten. `i32`/`u8` are where the join can
                    actually reach a union; `f64` is the measured CONTROL that joins
                    INSTEAD of unioning (`joinTys(i32, f64)` is `f64`, so the f32/f64
                    list-coercion path is provably outside this rung's population); `lit`
                    and `nul` are the two element kinds the existing re-stamp arm already
                    covers and must not move; `uni` is a destination that IS a union, where
                    a rule keyed on "the destination is not a union" must be inert; `brand`
                    is `nomLitAdopts`' newtype rule; `obj`/`str`/`bool` complete the reps.
              e1,e2 the two elements, as IDENTS of a concrete type and as BARE LITERALS. A
                    bare `true` is EXCLUDED from the A7 coercion (`!isBoolLitExpr`), so the
                    literal spelling must stay a loud reject where the ident spelling runs.
                    That pair is what says a rung did not widen the coercion.
              shape where the literal sits: a `const`, a re-assignment, a nested `[[..]]`, a
                    struct FIELD, a function ARGUMENT, a RETURN, a map VALUE, and a
                    three-element literal.
              read  which element is read back, so a wrong value at either slot is visible.

    block R   src   HOW the returned value derives from the hole: an element read off a
                    local `T[]`, off one built by `push`, off a `T[]` PARAM, a `.pop()`, a
                    map `.get`, a struct FIELD, a nested `T[][]`, and the two CONTROLS whose
                    return is the hole ITSELF (`return self`) or concrete (`return 1`).
              arg   what the call binds `T` to. Five, so the rep-compatible case (an i32,
                    where the un-annotated default rep IS i32) sits beside ref-repped ones.
              call  `g(p)` vs `p.g()` — TWO DIFFERENT pins, and wiring only one leaves the
                    method spelling silent beside a loud direct one.
              ann   the CELL is un-annotated; the TWIN declares `: T`.

    python3 joingrid.py [seed.wasm]                grade to stdout
    python3 joingrid.py --table                    the blocks as tables
    python3 joingrid.py --emit <dir>               write the cells
    python3 joingrid.py B.wasm --delta C.wasm      B = BASE (positional), C = AFTER
    python3 joingrid.py --write-lists C.wasm B.wasm [--refused S]
    python3 joingrid.py --verify B.wasm            B = the BASE seed
    python3 joingrid.py --price S                  the landing's price, REPAID by D601
    python3 joingrid.py --refused S                the refused sub-rung's price
    python3 joingrid.py --mkset                    materialise into distilled/named/
    python3 joingrid.py --coerce                   re-derive JCOERCE from the twins
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
# The seed this landing branched from (master 3d5f33b6 — #2020's landing, 1,503,970 bytes).
# `--price` reads it to tell "you handed me the pre-landing compiler" from "a candidate
# broke a price cell": on the base every price cell RUNS, so behaviour alone cannot separate
# the two answers and only the seed's IDENTITY can.
BASE_MD5 = "3c39ab42aa2618f517ce10d91796456f"
# The seed D601's landing branched from (master e6865598 — #2021's landing, 1,506,849 bytes),
# i.e. this grid's own base PLUS D591/D592. `--price` reads it for the same reason: on that
# compiler all ten repaid cells RUN and print `true`, so "they all fail" is a second
# wrong-seed signature that behaviour alone cannot tell from a real veto.
D601_BASE_MD5 = "c34c3c2764c82b1c6cd1497baa58e4b5"

INVALID = ("Invalid input WebAssembly code", "WebAssembly translation error",
           "wasm validation", "failed to parse", "failed to compile")
TRAP = ("wasm trap", "unreachable", "out of bounds", "divide by zero",
        "null reference", "cast failure", "integer overflow")
EMIT = ("emit error", "emitProgram:", "emitFail", "unsupported statement",
        "unsupported expression")

# WHAT `want_of` SAYS WHEN THE LANGUAGE ACCEPTS NO VALUE HERE — the twin is a loud reject,
# so the cell has no right answer and anything it prints contradicts its own declaration.
# A sentinel rather than a fabricated number: an artefact must not give a confident answer
# it did not compute, and `"0"` here would have read as one.
NOVALUE = "<no legitimate value — the twin the language endorses is a loud reject>"

PRELUDE = ["type V = { x: i32 }", "type A = { x: i32 }", "type B = { y: i32 }",
           "type AB = A | B", 'type K = "a" | "b"', "type A1 = new i32"]

# dst key -> (the destination ELEMENT spelling, how a value `z` of it is PRINTED)
DSTS = {
    "i32":   ("i32", "print(z)"),
    "u8":    ("u8", "print(z)"),
    "f64":   ("f64", "print(z)"),
    "str":   ("string", "print(z)"),
    "bool":  ("boolean", "print(z)"),
    "brand": ("A1", "print(z as i32)"),
    "lit":   ("K", "print(z)"),
    "nul":   ("(i32 | null)", "if z != null { print(z) } else { print(-9) }"),
    "uni":   ("AB", "if z is A { print(1) } else { print(2) }"),
    "obj":   ("V", "print(z.x)"),
}
# element key -> (how it is SPELLED in the literal, the decl it needs). A `*_l` key is a
# BARE LITERAL; every other is an IDENT of a concrete type, which is what makes the A7
# coercion applicable at all.
ELEMS = {
    "i32":    ("v_i32", "const v_i32: i32 = 7"),
    "bool":   ("v_bool", "const v_bool: boolean = true"),
    "str":    ("v_str", 'const v_str: string = "s"'),
    "f64":    ("v_f64", "const v_f64: f64 = 1.5"),
    "obj":    ("v_obj", "const v_obj: V = { x: 7 }"),
    "null":   ("null", ""),
    "i32_l":  ("3", ""),
    "bool_l": ("true", ""),
    "str_l":  ('"a"', ""),
    "f64_l":  ("2.5", ""),
}
JSHAPES = ["let", "assign", "nest", "field", "arg", "ret", "mapval", "three"]
JELEMS = list(ELEMS)
JDSTS = list(DSTS)
# The pairs the non-`let` shapes carry: every pair the join can take to a union, both
# orders, plus a bare-literal spelling of each and two same-rep controls.
PAIRS_CORE = [("i32", "bool"), ("bool", "i32"), ("i32_l", "bool"), ("bool", "i32_l"),
              ("i32", "str"), ("i32", "null"), ("obj", "i32"), ("i32", "f64"),
              ("i32", "i32_l"), ("str", "str_l")]


def _decls(dst, es):
    L = list(PRELUDE)
    for e in sorted(set(es)):
        d = ELEMS[e][1]
        if d and d not in L:
            L.append(d)
    return L


def _wrap(shape, dty, lit, read, L):
    """The shape's own statements, ending with a binding of `z`."""
    if shape == "let":
        L += ["const xs: %s[] = %s" % (dty, lit), "const z = xs[%d]" % read]
    elif shape == "assign":
        L += ["let xs: %s[] = []" % dty, "xs = %s" % lit, "const z = xs[%d]" % read]
    elif shape == "nest":
        L += ["const xs: %s[][] = [%s]" % (dty, lit), "const z = xs[0][%d]" % read]
    elif shape == "field":
        L.append("type Bx = { v: %s[] }" % dty)
        L += ["const bx: Bx = { v: %s }" % lit, "const z = bx.v[%d]" % read]
    elif shape == "arg":
        L += ["function take(xs: %s[]): %s { return xs[%d] }" % (dty, dty, read),
              "const z = take(%s)" % lit]
    elif shape == "ret":
        L += ["function mk(): %s[] { return %s }" % (dty, lit),
              "const ms = mk()", "const z = ms[%d]" % read]
    elif shape == "mapval":
        L += ["const m: {[string]: %s[]} = Map()" % dty,
              'm.set("k", %s)' % lit,
              'const q = m.get("k") ?? []',
              "const z = q[%d]" % read]
    else:  # three
        L += ["const xs: %s[] = %s" % (dty, lit), "const z = xs[%d]" % read]
    return L


def jcell_src(shape, dst, e1, e2, read):
    dty, dpr = DSTS[dst]
    s1, s2 = ELEMS[e1][0], ELEMS[e2][0]
    lit = "[%s, %s, %s]" % (s1, s2, s1) if shape == "three" else "[%s, %s]" % (s1, s2)
    L = _wrap(shape, dty, lit, read, _decls(dst, [e1, e2]))
    L.append(dpr)
    return "\n".join(L) + "\n"


def jcell_id(shape, dst, e1, e2, read):
    return "d591_%s_%s_%s__%s_r%d" % (shape, dst, e1, e2, read)


def jtwin_src(shape, dst, e):
    """THE TWIN: the same shape and destination with the read element ALONE, so the expected
    value is the language's own answer for that element in that slot."""
    dty, dpr = DSTS[dst]
    L = _wrap(shape, dty, "[%s]" % ELEMS[e][0], 0, _decls(dst, [e]))
    L.append(dpr)
    return "\n".join(L) + "\n"


def jtwin_id(shape, dst, e):
    return "d591t_%s_%s_%s" % (shape, dst, e)


# ── BLOCK R: the UN-ANNOTATED RETURN off a hole (D592) ─────────────────────────────────
# key -> (extra decls, body lines, the RETURN expression, the extra parameters)
RSRCS = {
    "elem":     ([], ["const xs: T[] = [self]"], "xs[0]", ""),
    "elemw":    ([], ["const xs: T[] = []", "xs.push(self)"], "xs[0]", ""),
    "param":    ([], [], "ys[0]", ", ys: T[]"),
    "pop":      ([], ["const xs: T[] = [self]"], "xs.pop() ?? self", ""),
    "mapget":   ([], ["const m: {[string]: T} = Map()", 'm.set("k", self)'],
                 'm.get("k") ?? self', ""),
    "field":    ([], ["const bx = { v: self }"], "bx.v", ""),
    "nest":     ([], ["const xs: T[][] = [[self]]"], "xs[0][0]", ""),
    "ident":    ([], [], "self", ""),
    "concrete": ([], [], "1", ""),
}
RSRCNAMES = list(RSRCS)
# arg key -> (spelling, literal, how `z` prints, the value the twin prints)
RARGS = {
    "i32":  ("i32", "7", "print(z)", "7"),
    "str":  ("string", '"s"', "print(z)", "s"),
    "bool": ("boolean", "true", "print(z)", "true"),
    "f64":  ("f64", "1.5", "print(z)", "1.5"),
    "obj":  ("V", "{ x: 7 }", "print(z.x)", "7"),
}
RARGNAMES = list(RARGS)
CALLS = ["plain", "ufcs"]


def rcell_src(srcname, arg, call, ann):
    decls, body, ret, extra = RSRCS[srcname]
    aty, alit, apr, _av = RARGS[arg]
    L = ["type V = { x: i32 }"] + list(decls)
    decl = ""
    if ann == "decl":
        decl = ": i32" if srcname == "concrete" else ": T"
    L.append("function g<T>(self: T%s)%s {" % (extra, decl))
    for b in body:
        L.append("  " + b)
    L.append("  return " + ret)
    L.append("}")
    L.append("const p: %s = %s" % (aty, alit))
    if extra:
        L.append("const qs: %s[] = [%s]" % (aty, alit))
        L.append("const z = %s" % ("p.g(qs)" if call == "ufcs" else "g(p, qs)"))
    else:
        L.append("const z = %s" % ("p.g()" if call == "ufcs" else "g(p)"))
    L.append("print(z)" if srcname == "concrete" else apr)
    return "\n".join(L) + "\n"


def rcell_id(srcname, arg, call, ann):
    return "d592_%s_%s_%s_%s" % (srcname, arg, call, ann)


def cells():
    out = {}
    for shape in JSHAPES:
        for dst in JDSTS:
            pairs = ([(a, b) for a in JELEMS for b in JELEMS if a != b]
                     if shape == "let" else PAIRS_CORE)
            reads = (0, 1) if shape == "let" else (1,)
            for (e1, e2) in pairs:
                for rd in reads:
                    out[jcell_id(shape, dst, e1, e2, rd)] = \
                        jcell_src(shape, dst, e1, e2, rd)
            for e in JELEMS:
                out[jtwin_id(shape, dst, e)] = jtwin_src(shape, dst, e)
    for s in RSRCNAMES:
        for a in RARGNAMES:
            for c in CALLS:
                for ann in ("infer", "decl"):
                    out[rcell_id(s, a, c, ann)] = rcell_src(s, a, c, ann)
    return out


def _axes(cid):
    """`d591_<shape>_<dst>_<e1>__<e2>_r<read>` — the DOUBLE underscore is the element
    separator, so an element key that itself contains `_` (`i32_l`) cannot be mis-split."""
    head, rd = cid.rsplit("_r", 1)
    body = head[len("d591_"):]
    left, e2 = body.split("__", 1)
    shape, rest = left.split("_", 1)
    for dst in JDSTS:
        if rest.startswith(dst + "_") and rest[len(dst) + 1:] in ELEMS:
            return shape, dst, rest[len(dst) + 1:], e2, int(rd)
    raise KeyError(cid)


def twin(cid):
    """The twin whose VALUE the cell must reproduce — for block J the READ element's own
    one-element spelling, for block R the same body with the return DECLARED."""
    if cid.startswith("d591_"):
        shape, dst, e1, e2, rd = _axes(cid)
        return jtwin_id(shape, dst, e1 if rd == 0 else e2)
    if cid.startswith("d592_"):
        assert cid.endswith("_infer"), cid
        return cid[: -len("_infer")] + "_decl"
    raise KeyError(cid)


def twins(cid):
    """EVERY twin a cell is graded against. A block-J cell has TWO — one per element — and
    both are load-bearing: the two-element literal may legitimately be a loud reject because
    the element that is NOT read does not fit the destination, and scoring it against the
    read element's twin alone calls that a disagreement when it is the language working.
    Measured: the one-twin relation reported 523 DISAGREEs on the base seed, nearly all of
    them `check` beside a running twin for exactly that reason."""
    if cid.startswith("d591_"):
        shape, dst, e1, e2, _rd = _axes(cid)
        return [jtwin_id(shape, dst, e1), jtwin_id(shape, dst, e2)]
    return [twin(cid)]


def want_of(cid):
    """The stdout a cell produces WHEN IT RUNS, read off its own axes rather than off a
    stored verdict. Never consulted for a cell that is not `runs`."""
    if cid.startswith("d592_"):
        _, s, a, _c, _ann = cid.split("_")
        return "1" if s == "concrete" else RARGS[a][3]
    if cid.startswith("d591t_"):
        rest = cid[len("d591t_"):]
        shape, rest = rest.split("_", 1)
        for dst in JDSTS:
            if rest.startswith(dst + "_") and rest[len(dst) + 1:] in ELEMS:
                return _want(shape, rest[len(dst) + 1:], dst)
        raise KeyError(cid)
    shape, dst, e1, e2, rd = _axes(cid)
    return _want(shape, e1 if rd == 0 else e2, dst)


def _want(shape, e, dst):
    """The coercion's answer. Keyed on the COERCION and never on the shape: where the
    language gives two answers for one coercion, one of them is a defect and the
    declaration says which (see `D601_WRONG`)."""
    return JCOERCE.get((e, dst), NOVALUE)


# WHAT THE LANGUAGE PRINTS for element `e` ALONE in a `dst[]` slot. Only the pairs it
# ACCEPTS have an entry; every other pair is a loud reject on the twin, so the cell has no
# value to expect. `--verify` re-derives every row from each cell's OWN TWIN on the seed
# under test, so a stale row FAILS rather than passing; `--coerce` prints the re-derivation.
JCOERCE = {
    ("bool", "bool"): "true",
    ("bool", "brand"): "1",
    ("bool", "i32"): "1",
    ("bool", "u8"): "1",
    ("bool_l", "bool"): "true",
    ("bool_l", "u8"): "1",
    ("f64", "f64"): "1.5",
    ("f64_l", "f64"): "2.5",
    ("i32", "f64"): "7",
    ("i32", "i32"): "7",
    ("i32", "nul"): "7",
    ("i32", "u8"): "7",
    ("i32_l", "brand"): "3",
    ("i32_l", "f64"): "3",
    ("i32_l", "i32"): "3",
    ("i32_l", "nul"): "3",
    ("i32_l", "u8"): "3",
    ("null", "nul"): "-9",
    ("obj", "obj"): "7",
    ("obj", "uni"): "1",
    ("str", "str"): "s",
    ("str_l", "lit"): "a",
    ("str_l", "str"): "a",
}

# THE ONE MEASURED PLACE WHERE THE LANGUAGE CONTRADICTS ITSELF, PINNED RATHER THAN
# LAUNDERED INTO AN EXPECTATION. A boolean element in a `u8[]` slot prints `1` through the
# `assign` and `ret` spellings and `true` through the `let` and `three` ones: the READ's print
# overload is picked from the initialiser literal's first element instead of from the declared
# `u8`. `want_of` says `1` for that coercion, because that is what the DECLARATION says a byte
# is, and these four twins are therefore `runs but wrong value` ON THE BASE SEED. That is
# inventory row D601, filed with its own witness
# (`const c: u8[] = [b]; print(c[0])` -> `true`, no mixed literal involved), and it is NOT this
# landing's business.
#
# LISTED, NOT SUPPRESSED. `--verify` skips these four in its expectation check AND FAILS IF
# ONE OF THEM IS NO LONGER WRONG — so the day D601 closes, this ledger flips instead of
# quietly staying green with a stale exemption. The same discipline a refutation pin uses.
#
# D601 CLOSED (#2022) AND THE EXEMPTION DID EXACTLY THAT — it flipped, on `--price` first.
# It STAYS, and it stays TRUE, because `--verify` grades ONE FROZEN COMPILER by md5: the
# pre-D591 base `3c39ab42`, on which every cell below still prints `true`. This list is a
# statement about that historical seed, not about the tree — the tree's statement is
# `--price` below, which now asserts the REPAYMENT. Read the two together: these eight are
# where the contradiction was first measured, and the ten in `price` are what it cost.
D601_WRONG = [
    "d591_let_u8_bool__bool_l_r0",
    "d591_let_u8_bool__bool_l_r1",
    "d591_let_u8_bool_l__bool_r0",
    "d591_let_u8_bool_l__bool_r1",
    "d591t_let_u8_bool",
    "d591t_let_u8_bool_l",
    "d591t_three_u8_bool",
    "d591t_three_u8_bool_l",
]



# THE REFUSED SUB-RUNG'S PRICE, WHICH IS NOT IN THIS GRID AT ALL — and saying so is the
# point. R3 (R2's STRUCT arm: an un-annotated generic return whose value is a struct) buys
# SIX cells here, every one of them `d592_*_obj_*`, and costs FOUR corpus modules that stop
# building: it mints a struct annotation naming an inline shape that nothing registered, and
# the emitter answers `emitProgram: ref valtype with no interned shape`. Every grid column
# stayed flat — 22 cells `invalid` -> `runs`, 0 lost, 0 wrong value — and only the corpus
# `cmp` LOST column saw it. That is the third time in three landings that `cmp` was the only
# instrument that could, and it is why the refusal's price is recorded as MODULES.
#
# Re-derive the candidate with `python3 scratch-int/d591/mkvariant.py R1R0R2R3`; `--refused`
# below re-checks the standing half — these four must keep building on the seed under test.
#
# 2026-08-30 — THE STRUCT ARM SHIPPED AND THIS LIST DID NOT CHANGE, which is the whole
# point of keeping it. The naive candidate was re-derived and re-measured first: it still
# kills all four, exactly as filed. What was wrong with it was the NAME it minted, not the
# arm — `monoRetRowName` now mints the name of the ROW the emitter's shape table already
# holds (`V`, never `{x: i32}`) and mints nothing where no row claims the shape. So these
# four keep building, the six cells run, and this mode goes on asserting the price for the
# next candidate rather than being retired with the one that paid it. TWO further candidates
# were refused BY this list and by `regress.py` — a recursive `TyErr` gate (redundant here,
# and it cost a recursive-struct return the row lookup wins) and a resolver widened to
# anonymous rows via `structIndexOfTypeName` (which moves `functions/structural-generic.vl`
# from `runs` to check-clean INVALID WASM: two instances of one generic collapse onto the
# same i32 row). See the D592 row.
REFUSED_MODULES = [
    "tests/cases/functions/structural-generic.vl",
    "tests/cases/index/generic-trap.vl",
    "tests/cases/objects/operator-self-method.vl",
    "tests/cases/objects/self-method.vl",
]


def _is_d601_coord(cid):
    """D601's coordinate: a `u8` destination whose literal's FIRST element is boolean-typed.
    That is the exact shape whose element READ takes its print overload from the initialiser
    instead of from the declared byte, and it is reproducible on the BASE seed with no mixed
    literal at all (`const c: u8[] = [b]; print(c[0])` prints `true`)."""
    if not cid.startswith("d591_"):
        return False
    _shape, dst, e1, _e2, _rd = _axes(cid)
    return dst == "u8" and e1 in ("bool", "bool_l")


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


def scored(cs):
    """The cells that HAVE a twin — the ones agreement is defined for."""
    return [n for n in cs
            if n.startswith("d591_") or (n.startswith("d592_") and n.endswith("_infer"))]


def agreement(g):
    """agree / DISAGREE against the twins the language endorses, VALUE INCLUDED.

    THE RULE, stated once: a multi-element literal must RUN exactly when every one of its
    elements runs ALONE in that same slot, and must then print what the READ element's own
    one-element spelling prints. So

      * every twin runs  ->  the cell must run AND print `want_of` (the read element's
                             answer). A cell that runs and prints something else is the
                             worst outcome this family has, and the one a grid that prints
                             a constant cannot see.
      * some twin does NOT run  ->  the cell must NOT run. Which non-`runs` class it lands
                             in is not scored: the literal contains an element the language
                             refuses in that slot, and refusing it in a `check` or an `emit`
                             are both the language declining, not a silent miscompile.

    Block R has ONE twin (the declared return) and is graded class-for-class plus value."""
    out = {}
    for n in scored(g):
        v = g[n]
        ts = [g[t] for t in twins(n)]
        if all(t["class"] == "runs" for t in ts):
            ok = v["class"] == "runs" and v["msg"] == want_of(n)
        elif n.startswith("d592_"):
            ok = v["class"] == ts[0]["class"]
        else:
            ok = v["class"] != "runs"
        out[n] = "agree" if ok else "DISAGREE"
    return out


def wrongvalue(g):
    """Cells that RUN and print something their own declaration contradicts — the outcome a
    grid that never prints the result cannot have."""
    return sorted(n for n, v in g.items()
                  if v["class"] == "runs" and v["msg"] != want_of(n))


def seed_md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_lists():
    return json.load(open(LISTS)) if os.path.exists(LISTS) else {}


def named_set(L):
    return sorted(set(L.get("fix", []) + L.get("price", []) + L.get("control", [])
                      + L.get("residue", []) + L.get("refute", [])
                      + L.get("deliberate", [])))


def require(name, rows):
    """A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY. Every scored list goes through this:
    an absent or empty ledger is a FAILURE, not three green zeroes."""
    if not rows:
        print("%s: EMPTY POPULATION -- the ledger lists no cells, so nothing was "
              "verified. This is a FAILURE, not a pass." % name)
        return False
    return True


def _seed_from_argv(args):
    # `--refused` takes a VALUE only while writing the ledger; standalone it is a MODE whose
    # seed is the positional. Treating it as value-taking in both swallowed the seed and
    # graded `build/vl-compiler.wasm` while reporting the flag's argument's name — a check
    # that answered about a compiler nobody asked about, and said so nowhere.
    takes_value = ["--delta", "--emit", "--write-lists"]
    if "--write-lists" in args:
        takes_value.append("--refused")
    for i, a in enumerate(args):
        if a.startswith("-") or not a.endswith(".wasm"):
            continue
        if i > 0 and args[i - 1] in takes_value:
            continue
        return a
    return os.path.join(R, "build/vl-compiler.wasm")


def main():
    args = sys.argv[1:]
    seed = _seed_from_argv(args)
    cs = cells()

    if "--emit" in args:
        d = args[args.index("--emit") + 1]
        os.makedirs(d, exist_ok=True)
        for n, s in cs.items():
            open(os.path.join(d, n + ".vl"), "w").write(s)
        print("wrote %d cells to %s" % (len(cs), d))
        return 0

    if "--mkset" in args:
        L = load_lists()
        want = named_set(L)
        if not require("named/", want):
            return 1
        man = os.path.join(NAMED, "manifest.json")
        M = json.load(open(man))
        n = 0
        for c in want:
            for m in [c] + twins(c):
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

    if "--coerce" in args:
        # RE-DERIVE the JCOERCE table from the twins on THIS seed, so the closed form in
        # this file is a transcription of the language's answer and never a guess.
        got = {}
        for shape in JSHAPES:
            for dst in JDSTS:
                for e in JELEMS:
                    v = base[jtwin_id(shape, dst, e)]
                    if v["class"] == "runs":
                        got.setdefault((e, dst), set()).add(v["msg"])
        print("JCOERCE = {")
        for k in sorted(got):
            vs = got[k]
            mark = "" if len(vs) == 1 else "   # SHAPE-DEPENDENT: %s" % sorted(vs)
            print('    ("%s", "%s"): "%s",%s' % (k[0], k[1], sorted(vs)[0], mark))
        print("}")
        miss = [k for k in JCOERCE if k not in got]
        extra = [k for k in got if k not in JCOERCE]
        print("# in JCOERCE but no twin runs: %s" % (miss or "none"))
        print("# a twin runs but not in JCOERCE: %s" % (extra or "none"))
        return 0

    if "--write-lists" in args:
        cand = args[args.index("--write-lists") + 1]
        after = grade_all(cand, cs)
        aft_agr = agreement(after)
        SILENT = ("invalid", "trap", "emit")
        sc = set(scored(cs))
        moved = sorted(n for n in base
                       if (base[n]["class"], base[n]["msg"]) !=
                          (after[n]["class"], after[n]["msg"]))
        fix = [n for n in moved if n in sc]
        control = sorted(n for n in sc
                         if agr.get(n) == "agree" and base[n]["class"] == "runs"
                         and after[n]["class"] == "runs")
        refused = [args[i + 1] for i, a in enumerate(args) if a == "--refused"]
        # THE PRICE THIS LANDING PAYS IS NOT A LOST `runs` — IT LOSES NONE. Both halves of
        # the population it moves are `invalid` on the base; what a subset of them become is
        # `runs` printing a value their own declaration contradicts, which is the other
        # silent class. Scoring `runs` -> not-`runs` here would report ZERO and be true, and
        # the price would go unrecorded — which is the arithmetic invisibility CLAUDE.md
        # names for the histogram case, one column over.
        wv_after = set(wrongvalue(after))
        wv_before = set(wrongvalue(base))
        price = sorted(n for n in sc
                       if (base[n]["class"] == "runs" and after[n]["class"] != "runs")
                       or (n in wv_after and n not in wv_before))
        whopaid = {"the landing itself (overridden, not refused)": price}
        REFGRADE = {rs: grade_all(rs, cs) for rs in refused}
        for rs in refused:
            rg = REFGRADE[rs]
            for n in sc:
                if base[n]["class"] == "runs" and rg[n]["class"] != "runs" \
                        and after[n]["class"] == "runs":
                    whopaid.setdefault(os.path.basename(rs), []).append(n)
        refute = set()
        for rs in refused:
            rg = REFGRADE[rs]
            for n in sc:
                if base[n]["class"] == "check" and after[n]["class"] == "check" \
                        and agr.get(n) == "agree" and rg[n]["class"] == "runs":
                    refute.add(n)
                    whopaid.setdefault(os.path.basename(rs) + " (invented a runs)",
                                       []).append(n)
        deliberate = sorted(n for n in sc
                            if base[n]["class"] == "runs" and after[n]["class"] == "runs"
                            and aft_agr.get(n) == "DISAGREE")
        residue = sorted(n for n in sc
                         if after[n]["class"] in SILENT
                         and all(after[t]["class"] == "runs" for t in twins(n)))
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

    if "--delta" in args:
        # ARGUMENT ORDER: the positional seed is the BASE, `--delta` takes the AFTER seed.
        # Reversed, a landing's fixes read as regressions — which has happened.
        other = args[args.index("--delta") + 1]
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
        print("  DISAGREE with the twin: %d -> %d" % (dis_b, dis_a))
        pairs = {}
        for n in moved:
            k = (base[n]["class"], after[n]["class"])
            pairs[k] = pairs.get(k, 0) + 1
        for (x, y), c in sorted(pairs.items(), key=lambda t: -t[1]):
            print("    %-8s -> %-8s %4d" % (x, y, c))
        for lbl, rows in (("runs LOST", lost), ("-> silent", silent),
                          ("-> WRONG VALUE", sorted(wv_a - wv_b))):
            for n in rows[:24]:
                print("  %-14s %s   %s" % (lbl, n, after[n]["msg"][:60]))
        return 0

    if "--table" in args:
        print("== BLOCK J (the joined element): cell/twin by dst x (e1,e2), shape=let, "
              "read=1")
        print("%-12s %s" % ("dst|e1", " ".join("%-14s" % e for e in JELEMS)))
        for dst in JDSTS:
            for e1 in JELEMS:
                row = []
                for e2 in JELEMS:
                    if e1 == e2:
                        row.append("%-14s" % "-")
                        continue
                    n = jcell_id("let", dst, e1, e2, 1)
                    row.append("%-14s" % ("%s/%s" % (base[n]["class"][:6],
                                                     base[twin(n)]["class"][:6])))
                print("%-12s %s" % ("%s|%s" % (dst, e1), " ".join(row)))
            print()
        print("== BLOCK J by SHAPE (the core pairs, read=1): agree / DISAGREE")
        print("%-10s %s" % ("shape", " ".join("%-8s" % d for d in JDSTS)))
        for shape in JSHAPES:
            row = []
            for dst in JDSTS:
                pairs = ([(a, b) for a in JELEMS for b in JELEMS if a != b]
                         if shape == "let" else PAIRS_CORE)
                dis = sum(1 for (a, b) in pairs
                          if agr.get(jcell_id(shape, dst, a, b, 1)) == "DISAGREE")
                row.append("%-8s" % ("%d/%d" % (dis, len(pairs))))
            print("%-10s %s" % (shape, " ".join(row)))
        print()
        print("== BLOCK R (the un-annotated return): infer/decl by src x arg (call=plain)")
        print("%-10s %s" % ("src", " ".join("%-16s" % a for a in RARGNAMES)))
        for s in RSRCNAMES:
            row = []
            for a in RARGNAMES:
                n = rcell_id(s, a, "plain", "infer")
                row.append("%-16s" % ("%s/%s" % (base[n]["class"], base[twin(n)]["class"])))
            print("%-10s %s" % (s, " ".join(row)))
        nd = sum(1 for g in agr.values() if g == "DISAGREE")
        wv = wrongvalue(base)
        print("\n%d of %d scored cells DISAGREE with their twin" % (nd, len(agr)))
        print("%d of %d cells RUN and print a value their declaration contradicts"
              % (len(wv), len(base)))
        for n in wv[:20]:
            print("   WRONG VALUE %s  want %s got %s" % (n, want_of(n), base[n]["msg"]))
        return 0

    if "--verify" in args:
        # (1) THE DISTINGUISHING RULE, mechanised: every cell in `fix` must DISAGREE with
        #     its twin on the BASE seed, so its expected answer differs from the answer it
        #     would give if the rungs under test did nothing. `--verify` TAKES THE BASE, and
        #     says so by md5 rather than trusting the caller.
        # (2) A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY.
        # (3) Nothing here is a cached verdict: `JCOERCE` and block R's expectations are
        #     re-derived from each cell's OWN TWIN below, so a stale row fails.
        rc = 0
        if BASE_MD5 != seed_md5(seed):
            print("verify: this is NOT the base seed (md5 %s, want %s). Every check below "
                  "is about what the BASE did, so grading them against another compiler "
                  "answers a different question." % (seed_md5(seed), BASE_MD5))
            return 2
        fix = L.get("fix", [])
        if not require("distinguishing", fix):
            rc = 1
        blind = [n for n in fix if agr.get(n) == "agree"]
        for n in blind[:20]:
            print("BLIND (already gives the twin's answer on the base): %s" % n)
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
        print("control: %d of %d controls are not agreeing `runs`"
              % (len(badctl), len(ctl)))
        if badctl:
            rc = 1
        # THE EXPECTATION TABLE, RE-DERIVED FROM THE LANGUAGE — over the cells the twin
        # ENDORSES (a twin, or an agreeing cell). Over all `runs` cells it would instead be
        # asserting the base seed is clean, and it is not: that is the defect.
        endorsed = [n for n, v in base.items() if v["class"] == "runs"
                    and (n not in agr or agr.get(n) == "agree")]
        if not require("expectations", endorsed):
            rc = 1
        badexp = [(n, want_of(n), base[n]["msg"]) for n in endorsed
                  if base[n]["msg"] != want_of(n) and n not in D601_WRONG]
        # THE FILED EXEMPTION, RE-ASKED. A D601 cell that starts agreeing with its own
        # declaration means that row closed and this ledger is stale — which must FAIL here
        # rather than pass quietly, exactly as a refutation pin does.
        healed = [n for n in D601_WRONG
                  if base[n]["class"] != "runs" or base[n]["msg"] == want_of(n)]
        for n in healed:
            print("D601 EXEMPTION IS STALE: %s is %s/%r, which its declaration now agrees "
                  "with — drop it from D601_WRONG and re-grade" % (n, base[n]["class"],
                                                                   base[n]["msg"]))
        print("D601: %d of %d filed wrong-value cells no longer wrong"
              % (len(healed), len(D601_WRONG)))
        if healed:
            rc = 1
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
        if not require("refused modules", REFUSED_MODULES):
            rc = 1
        else:
            print("refused modules: %d recorded (R3's price, scored by `--refused`, which "
                  "the grid cannot see — it is FOUR corpus modules that stop building, not "
                  "a cell)" % len(REFUSED_MODULES))
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
            print("refute: NOT APPLICABLE AS A CELL LIST, AND MEASURED — the refused "
                  "sub-rung R3 invented no `runs` this grid can see and cost no cell it "
                  "can see either. Its whole price is the four modules in "
                  "`REFUSED_MODULES`, which `--refused` scores.")
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
            for m in [n] + twins(n):
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

    if "--refused" in args and "--write-lists" not in args:
        # The refused sub-rung's price, executable: the four modules R3 killed must build.
        if not require("refused modules", REFUSED_MODULES):
            return 1
        bad = []
        for m in REFUSED_MODULES:
            r = subprocess.run([VL, "build", os.path.join(R, m), "-o",
                                os.path.join(tempfile.gettempdir(), "joingrid_ref.wasm"),
                                "--compiler", seed],
                               capture_output=True, text=True, timeout=300)
            if r.returncode != 0:
                bad.append((m, " ".join((r.stderr + r.stdout).split())[:90]))
        print("refused sub-rung R3's price: %d modules   seed %s (md5 %s)"
              % (len(REFUSED_MODULES), os.path.basename(seed), seed_md5(seed)))
        for m, e in bad:
            print("  STOPPED BUILDING %s   %s" % (m, e))
        print("refused: %s"
              % ("held — every module R3 would have killed still builds"
                 if not bad else "VETO (%d modules do not build)" % len(bad)))
        return 0 if not bad else 1

    if "--price" in args:
        # THE LANDING'S PRICE, RE-DERIVED THE DAY IT WAS REPAID (#2022).
        #
        # It read, until D601 closed: these ten cells RAN on the pre-D591 base and do not
        # now, so each must (a) still not run and (b) agree with the twin the language
        # endorses. It FAILED BY DESIGN the moment a cell became correct — "NOW CORRECT
        # (D601 closed?)" on all ten — which is the whole reason it was written that way,
        # and it is why this ledger is re-derived here rather than exempted.
        #
        # WHAT IT ASSERTS NOW IS THE REPAYMENT, and it is a STRONGER claim than the one it
        # replaced. D591 bought these ten from `the engine refuses this module` to `runs,
        # printing true`; D601's rung took them the rest of the way to the value their own
        # declaration endorses. So each must now (a) RUN and print `want_of` — the answer
        # its one-element twin gives — and (b) still be inside D601's coordinate, which is
        # what says the population did not drift out from under the claim. A cell that
        # stops running, or starts printing `true` again, is a re-opening and fails here.
        #
        # THE KEY KEEPS ITS NAME AND THE MODE CHANGES ITS CLAIM. `price` is what
        # `--write-lists` DERIVES (the cells a candidate cost), `named_set` reads it, and a
        # second name would need all three kept in step for no gain. What a reader must not
        # miss is that the debt is settled, so every line this mode prints says REPAID.
        # Note what is no longer re-derivable: run `--write-lists` against the same pair
        # today and the derivation yields NOTHING, because these ten now run and print
        # correctly on the candidate. The ledger is history, and history is why it is kept.
        repaid = L.get("price", [])
        if not require("price (repaid)", repaid):
            return 1
        missing = [n for n in repaid
                   if not os.path.exists(os.path.join(NAMED, n + ".vl"))]
        if missing:
            print("price: %d cells are MISSING from named/ (%s...) — the population this "
                  "check is about does not exist. FAILURE." % (len(missing), missing[0]))
            return 1
        # WRONG SEED IS A DISTINCT ANSWER FROM VETO, decided by the seed's own IDENTITY
        # before anything is graded — and there are now TWO wrong seeds, one per landing,
        # each of which fails all ten for its own reason. Reporting either as a veto would
        # read as "the landing broke ten cells" when it means "you handed me a compiler
        # from before the fix". Behaviour cannot separate those answers; md5 can.
        for md5, what in ((BASE_MD5, "the pre-D591 base (3d5f33b6), where every one of "
                                     "these cells is a module the engine REFUSES"),
                          (D601_BASE_MD5, "the pre-D601 base (e6865598), where every one "
                                          "of these cells RUNS and prints `true`")):
            if md5 == seed_md5(seed):
                print("price cells (REPAID by D601, #2022): %d   seed %s (md5 %s)"
                      % (len(repaid), os.path.basename(seed), seed_md5(seed)))
                print("price: this IS %s — so term (a) fails on all ten and the report "
                      "would read as `the landing broke ten cells`. Re-run against "
                      "build/vl-compiler.wasm from this branch." % what)
                return 2
        wv = set(wrongvalue(base))
        bad_a, bad_b = [], []
        for n in repaid:
            v = base[n]
            # (a) EACH CELL IS REPAID: it RUNS and prints the value its own declaration
            #     endorses. Not running is the outcome D591 bought it out of; running and
            #     printing something else is the outcome D601 bought it out of. Either is
            #     a re-opening of a closed row, and neither may pass quietly.
            if v["class"] != "runs":
                bad_a.append((n, "NO LONGER RUNS -> " + v["class"], v["msg"][:40]))
            elif n in wv:
                bad_a.append((n, "RUNS BUT WRONG (D601 re-opened?) want "
                              + str(want_of(n)), v["msg"][:40]))
            # (b) AND IT IS STILL INSIDE THE COORDINATE THE ROW OWNS: a `u8` destination
            #     whose literal's FIRST element is a boolean. A cell that drifts out of
            #     D601's coordinate is not evidence about D601 either way.
            elif not _is_d601_coord(n):
                bad_b.append((n, "OUTSIDE D601's COORDINATE", v["msg"][:40]))
        print("price cells (REPAID by D601, #2022): %d   seed %s (md5 %s)"
              % (len(repaid), os.path.basename(seed), seed_md5(seed)))
        print("  (a) RUNS and prints the value its declaration endorses          : %d fail"
              % len(bad_a))
        print("  (b) still inside D601's coordinate (`u8[]`, boolean first)      : %d fail"
              % len(bad_b))
        for lbl, rows in (("MOVED", bad_a), ("DRIFTED", bad_b)):
            for r in rows[:10]:
                print("  %s %s" % (lbl, r))
        ok = not (bad_a or bad_b)
        print("price: %s" % ("held — every cell D591 paid for is a `u8[]` whose literal "
                             "begins with a boolean, which is D601's own coordinate, and "
                             "every one of them now prints the byte it declares"
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
    print("  %d of %d scored cells DISAGREE with their twin" % (nd, len(agr)))
    print("  %d cells RUN and print a value their declaration contradicts" % len(wv))
    return 0


if __name__ == "__main__":
    sys.exit(main())
