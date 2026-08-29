#!/usr/bin/env python3
"""D471 / D425 — the two remaining DECLARATION-SITE shapes of a BINARY operator that
can never fire, and the one shape that must keep firing.

`d444/opgrid.py` next door settled the other two seams (arity, and the index
operator's receiver). This grid settles the last two, which differ in exactly one
axis each from a declaration that dispatches:

  D471  the FIRST PARAMETER'S NAME. `opSelfFnTy` requires `p0.parName == "self"`
        and returns -1 before it consults any type — its own comment calls this
        "the pollution rule". So the answer is RECEIVER-INDEPENDENT: rename the
        parameter and a declaration that dispatched over a struct goes inert.
        Syntactic, so its gate is `parseFuncTail`'s.

  D425  the `self` TYPE. `checkBinary` reaches `opSelfFnTy` only under
        `if odsp is TyObj` over the LEFT operand, so a declaration whose `self`
        annotation does not denote an object is inert at every site. Needs the
        RESOLVED type — an alias, a newtype and an intersection are three
        different answers to one spelling — so its gate is the pass-1 hoist's.

EVERY CELL SHIPS WITH ITS OWN DO-NOTHING CONTROL, and that is the part worth
copying. A control is the cell's program with the DECLARATION DELETED and nothing
else changed, so it IS, by construction, the answer the cell would give if the
thing under test did nothing. The grade is then a comparison against two known
answers rather than against a remembered one:

    dispatch — the cell printed the DECLARATION's answer
    inert    — the cell printed its own CONTROL's answer (silently ignored)
    loud     — the cell does not run
    other    — neither; always worth reading

`--verify` MECHANISES the rule DECISIONS.md states as the lesson of #2005's two
failed grids — *a cell's expected answer must differ from the answer it would give
if the thing under test did nothing* — by running every control and refusing any
cell whose control answer equals its declaration answer. #2005 stated that rule in
prose and its own grid still broke it twice; stated as an assertion it caught 32
cells of this grid on the FIRST run (the string and litunion rows had ascending
operands, so `"ab" < "cd"` was natively `true` and the `<` declarations returned
`true` as well). Prose does not fail a run.

    python3 scripts/silent-sweep/d471/opdeclgrid.py [seed.wasm]   grade to stdout
    python3 scripts/silent-sweep/d471/opdeclgrid.py --emit <dir>  write the cells
    python3 scripts/silent-sweep/d471/opdeclgrid.py --mkset       write named/
    python3 scripts/silent-sweep/d471/opdeclgrid.py --verify      both checks
    python3 scripts/silent-sweep/d471/opdeclgrid.py --price S     the runs-lost override
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
NAMED = os.path.join(R, "scripts/silent-sweep/distilled/named")
JOBS = int(os.environ.get("JOBS", "6"))

# ── the ten names `ast.vl:isBinOpFuncName` admits ────────────────────────────────
OPS = ["+", "-", "*", "/", "%", "^", "<", "<=", ">", ">="]
RELATIONAL = {"<", "<=", ">", ">="}
OPN = {"+": "add", "-": "sub", "*": "mul", "/": "div", "%": "rem", "^": "pow",
       "<": "lt", "<=": "le", ">": "gt", ">=": "ge"}

# ── the `self` annotations, each with the operand pair it is exercised at ────────
# EVERY PAIR IS ORDERED `a > b`, numeric and string alike, so that one relational
# declaration answer is wrong for every row: the native ordering is FALSE for
# `< <=` and TRUE for `> >=` in all of them. The first cut had the strings
# ascending and `--verify` refused 32 cells for it.
SELF = {
    # name:      (annot,            preamble,                        bind a,                                 bind b)
    "i32":       ("i32", "", "const a: i32 = 7", "const b: i32 = 1"),
    "i64":       ("i64", "", "const a: i64 = 7", "const b: i64 = 1"),
    "f64":       ("f64", "", "const a: f64 = 7.5", "const b: f64 = 1.5"),
    "f32":       ("f32", "", "const a: f32 = 7.5", "const b: f32 = 1.5"),
    "string":    ("string", "", 'const a: string = "cd"', 'const b: string = "ab"'),
    "boolean":   ("boolean", "", "const a: boolean = true", "const b: boolean = false"),
    "obj":       ("V", "type V = { x: i32 }", "const a: V = { x: 7 }", "const b: V = { x: 1 }"),
    "objnew":    ("NV", "type NV = new { x: i32 }", "const a: NV = { x: 7 }", "const b: NV = { x: 1 }"),
    "objinline": ("{x: i32}", "", "const a: {x: i32} = { x: 7 }", "const b: {x: i32} = { x: 1 }"),
    "inter":     ("AB", "type AB = {a: i32} & {b: i32}", "const a: AB = { a: 7, b: 1 }", "const b: AB = { a: 1, b: 7 }"),
    "litunion":  ("K", 'type K = "a" | "b"', 'const a: K = "b"', 'const b: K = "a"'),
    "numunion":  ("NK", "type NK = 0 | 1 | 2", "const a: NK = 2", "const b: NK = 1"),
    "arr_i32":   ("i32[]", "", "const a: i32[] = [7]", "const b: i32[] = [1]"),
    "arr_str":   ("string[]", "", 'const a: string[] = ["q"]', 'const b: string[] = ["p"]'),
    "arr_obj":   ("V[]", "type V = { x: i32 }", "const a: V[] = [{ x: 7 }]", "const b: V[] = [{ x: 1 }]"),
    "map":       ("{[string]: i32}", "", 'const a: {[string]: i32} = { "k": 7 }', 'const b: {[string]: i32} = { "k": 1 }'),
    "fn":        ("(i32) => i32", "", "const a: (i32) => i32 = (n: i32) => n", "const b: (i32) => i32 = (n: i32) => n"),
    "nullable":  ("V | null", "type V = { x: i32 }", "const a: V | null = { x: 7 }", "const b: V | null = { x: 1 }"),
    "typaram":   ("T", "", "const a: i32 = 7", "const b: i32 = 1"),
}
# `typaram` is the one row whose declaration is GENERIC: the annotation names a type
# parameter, so the declaration carries `<T>` while the operands stay i32.
GENERIC = {"typaram"}

# A KNOWN CONFOUND, recorded rather than hidden. The `arr_*` rows are LOUD at every
# operator, and for `+` the loud thing is `print of i32[] is type-unsupported`, not
# the concat — which the language does define. So this grid does not measure whether
# a `+` declared over `i32[]` is inert; `PINS` below carries the cell that does,
# reading `(a + b)[0]` instead of the array itself.
CONFOUNDED = {("+", "arr_i32"), ("+", "arr_str"), ("+", "arr_obj")}

P0 = {"self": "self", "z": "z"}
SPELL = {"tok": "{op}", "quo": '"{op}"'}


def decl_answer(op):
    """The declaration body's value — never one the native lowering produces at this
    grid's operands. `--verify` proves that against the real control."""
    if op in RELATIONAL:
        return ("boolean", "true" if op in ("<", "<=") else "false")
    return ("i32", "99")


def cell_src(op, sname, p0, sp, with_decl=True):
    annot, pre, ba, bb = SELF[sname]
    ret, body = decl_answer(op)
    lines = []
    if pre:
        lines.append(pre)
    if with_decl:
        lines.append("function %s%s(%s: %s, other: %s): %s { return %s }" % (
            SPELL[sp].format(op=op), "<T>" if sname in GENERIC else "",
            P0[p0], annot, annot, ret, body))
    lines += [ba, bb, "print(a %s b)" % op]
    return "\n".join(lines) + "\n"


def cell_id(op, sname, p0, sp):
    return "d471_%s_%s_%s_%s" % (OPN[op], sname, p0, sp)


# ── the PINS: a declaration that is never USED ───────────────────────────────────
# The main grid always writes `a op b`, so every cell's answer is decided at a site.
# These have NO site at all, which is the only way to see the DECLARATION gate by
# itself — and it is what protects `tyDenotesObj`'s look-through. `pin_inter` runs
# today because that helper sees an intersection alias as the object it is; a gate
# narrowed back to a bare `is TyObj` refuses it, and the cell goes runs -> not-runs,
# which `regress.py` BLOCKS on. Nothing in the site-driven grid can catch that:
# `self: AB` at a site is loud on both sides for D402's reasons.
PINS = {
    # id                     preamble                          self annot   typarams  must
    "d471_pin_inter":     ("type AB = {a: i32} & {b: i32}", "AB", "", "runs"),
    "d471_pin_obj":       ("type V = { x: i32 }", "V", "", "runs"),
    "d471_pin_objnew":    ("type NV = new { x: i32 }", "NV", "", "runs"),
    "d471_pin_typaram":   ("", "T", "<T>", "runs"),
    "d471_pin_unannot":   ("", "", "", "runs"),
    # the PRICE side of the same shape: an inert declaration nothing uses ran too
    "d471_pin_i32":       ("", "i32", "", "price"),
    "d471_pin_string":    ("", "string", "", "price"),
    "d471_pin_alias_i32": ("type Id = i32", "Id", "", "price"),
    "d471_pin_new_i32":   ("type Id = new i32", "Id", "", "price"),
    "d471_pin_union":     ("type U = i32 | string", "U", "", "price"),
}
PIN_OUT = "1"


def pin_src(pid, with_decl=True):
    pre, annot, tp, _must = PINS[pid]
    lines = []
    if pre:
        lines.append(pre)
    if with_decl:
        sig = "self, other" if annot == "" else "self: %s, other: %s" % (annot, annot)
        lines.append('function "+"%s(%s): i32 { return 99 }' % (tp, sig))
    lines.append("print(%s)" % PIN_OUT)
    return "\n".join(lines) + "\n"


def cells(with_decl=True):
    out = {}
    for op in OPS:
        for sname in SELF:
            for p0 in P0:
                for sp in SPELL:
                    out[cell_id(op, sname, p0, sp)] = cell_src(op, sname, p0, sp, with_decl)
    for pid in PINS:
        out[pid] = pin_src(pid, with_decl)
    return out


def expectation(cid):
    """The DECLARATION's answer, which is what `named/manifest.json` records — so a
    future lift of either reject grades `runs but wrong value` rather than quietly
    reading `runs`. #2005 established the pattern; the older `d425c*` set predates
    it and recorded a bare `runs`, which is the weaker record of the two."""
    if cid in PINS:
        return PIN_OUT
    op = cid.split("_")[1]
    return decl_answer({v: k for k, v in OPN.items()}[op])[1]


def grade_one(src, seed):
    with tempfile.NamedTemporaryFile("w", suffix=".vl", delete=False, dir="/tmp") as f:
        f.write(src)
        p = f.name
    try:
        r = subprocess.run([VL, "run", p, "--compiler", seed],
                           capture_output=True, text=True, timeout=180)
        if r.returncode != 0:
            err = ((r.stderr or r.stdout).strip().splitlines() or ["rc"])[-1]
            return (False, err.split(": ", 1)[-1].strip())
        return (True, r.stdout.strip().replace("\n", "|"))
    except subprocess.TimeoutExpired:
        return (False, "TIMEOUT")
    finally:
        os.unlink(p)


def grade_all(seed):
    cs, ks = cells(True), cells(False)
    res = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=JOBS) as ex:
        cf = {ex.submit(grade_one, cs[n], seed): n for n in cs}
        kf = {ex.submit(grade_one, ks[n], seed): n for n in ks}
        cell = {cf[f]: f.result() for f in concurrent.futures.as_completed(cf)}
        ctl = {kf[f]: f.result() for f in concurrent.futures.as_completed(kf)}
    for n in cs:
        cr, co = cell[n]
        kr, ko = ctl[n]
        exp = expectation(n)
        if n in PINS:
            # A PIN'S MEASUREMENT IS THE DECLARATION'S ACCEPTANCE, not a printed
            # value: it has no operator site, so cell and control print the same
            # thing by construction and differ only in whether the program compiles
            # at all. That is why the do-nothing rule below skips them — and why it
            # is safe to: `accepted` vs `loud` is not a value comparison, so there is
            # no answer for the control to accidentally supply.
            g = "accepted" if cr else "loud"
        elif not cr:
            g = "loud"
        elif co == exp:
            g = "dispatch"
        elif kr and co == ko:
            g = "inert"
        else:
            g = "other"
        res[n] = {"grade": g, "cell": (cr, co), "ctl": (kr, ko), "expect": exp}
    return res


# ── the NAMED set ────────────────────────────────────────────────────────────────
# LISTED here as a RULE over this grid's own axes rather than as 300 literal names,
# because every axis value is in this file already and a literal list of them would
# be the same information written twice. What is NOT derived is the boundary between
# price and boundary: that is read off the BASE compiler's grades once and written
# down, exactly as `d444/opgrid.py`'s two lists are, because on the closing compiler
# the price cells are refusals indistinguishable from hundreds of their neighbours.
#
# PRICE — 239 cells the landing moves `runs` -> loud check reject, each running only
# because its own declaration was dead: the body says 99 (or `true`/`false` against
# the opposite native answer) and the program printed the built-in's. 129 are D471's
# (`p0 == "z"`, any `self` type the language answers for) and 110 are D425's
# (`p0 == "self"`, a `self` type that is not an object). Plus 5 PIN cells.
#
# BOUNDARY — 79 cells that RUN on both sides with the identical stdout, and they are
# the half that says the gates stopped where they were told to. 60 are the object
# receivers that DISPATCH (and must never stop); 19 are D425's RESIDUE, a generic
# `function "+"<T>(self: T, other: T)` that is still silent at an i32 site and is
# deliberately not closed here — the hole is decided per call site, and the same
# declaration DISPATCHES at an object one. Plus 5 PIN cells, `d471_pin_inter` first.
PRICE = [
    "d471_add_f32_self_quo", "d471_add_f32_self_tok", "d471_add_f32_z_quo",
    "d471_add_f32_z_tok", "d471_add_f64_self_quo", "d471_add_f64_self_tok",
    "d471_add_f64_z_quo", "d471_add_f64_z_tok", "d471_add_i32_self_quo",
    "d471_add_i32_self_tok", "d471_add_i32_z_quo", "d471_add_i32_z_tok",
    "d471_add_i64_self_quo", "d471_add_i64_self_tok", "d471_add_i64_z_quo",
    "d471_add_i64_z_tok", "d471_add_numunion_self_quo",
    "d471_add_numunion_self_tok", "d471_add_numunion_z_quo",
    "d471_add_numunion_z_tok", "d471_add_string_self_quo",
    "d471_add_string_self_tok", "d471_add_string_z_quo", "d471_add_string_z_tok",
    "d471_add_typaram_z_quo", "d471_add_typaram_z_tok", "d471_div_f32_self_quo",
    "d471_div_f32_self_tok", "d471_div_f32_z_quo", "d471_div_f32_z_tok",
    "d471_div_f64_self_quo", "d471_div_f64_self_tok", "d471_div_f64_z_quo",
    "d471_div_f64_z_tok", "d471_div_i32_self_quo", "d471_div_i32_self_tok",
    "d471_div_i32_z_quo", "d471_div_i32_z_tok", "d471_div_i64_self_quo",
    "d471_div_i64_self_tok", "d471_div_i64_z_quo", "d471_div_i64_z_tok",
    "d471_div_numunion_self_quo", "d471_div_numunion_self_tok",
    "d471_div_numunion_z_quo", "d471_div_numunion_z_tok", "d471_div_typaram_z_quo",
    "d471_div_typaram_z_tok", "d471_ge_f32_self_quo", "d471_ge_f32_self_tok",
    "d471_ge_f32_z_quo", "d471_ge_f32_z_tok", "d471_ge_f64_self_quo",
    "d471_ge_f64_self_tok", "d471_ge_f64_z_quo", "d471_ge_f64_z_tok",
    "d471_ge_i32_self_quo", "d471_ge_i32_self_tok", "d471_ge_i32_z_quo",
    "d471_ge_i32_z_tok", "d471_ge_i64_self_quo", "d471_ge_i64_self_tok",
    "d471_ge_i64_z_quo", "d471_ge_i64_z_tok", "d471_ge_litunion_self_quo",
    "d471_ge_litunion_self_tok", "d471_ge_litunion_z_quo", "d471_ge_litunion_z_tok",
    "d471_ge_numunion_self_quo", "d471_ge_numunion_self_tok",
    "d471_ge_numunion_z_quo", "d471_ge_numunion_z_tok", "d471_ge_string_self_quo",
    "d471_ge_string_self_tok", "d471_ge_string_z_quo", "d471_ge_string_z_tok",
    "d471_ge_typaram_z_quo", "d471_ge_typaram_z_tok", "d471_gt_f32_self_quo",
    "d471_gt_f32_self_tok", "d471_gt_f32_z_quo", "d471_gt_f32_z_tok",
    "d471_gt_f64_self_quo", "d471_gt_f64_self_tok", "d471_gt_f64_z_quo",
    "d471_gt_f64_z_tok", "d471_gt_i32_self_quo", "d471_gt_i32_self_tok",
    "d471_gt_i32_z_quo", "d471_gt_i32_z_tok", "d471_gt_i64_self_quo",
    "d471_gt_i64_self_tok", "d471_gt_i64_z_quo", "d471_gt_i64_z_tok",
    "d471_gt_litunion_self_quo", "d471_gt_litunion_self_tok",
    "d471_gt_litunion_z_quo", "d471_gt_litunion_z_tok", "d471_gt_numunion_self_quo",
    "d471_gt_numunion_self_tok", "d471_gt_numunion_z_quo", "d471_gt_numunion_z_tok",
    "d471_gt_string_self_quo", "d471_gt_string_self_tok", "d471_gt_string_z_quo",
    "d471_gt_string_z_tok", "d471_gt_typaram_z_quo", "d471_gt_typaram_z_tok",
    "d471_le_f32_self_quo", "d471_le_f32_self_tok", "d471_le_f32_z_quo",
    "d471_le_f32_z_tok", "d471_le_f64_self_quo", "d471_le_f64_self_tok",
    "d471_le_f64_z_quo", "d471_le_f64_z_tok", "d471_le_i32_self_quo",
    "d471_le_i32_self_tok", "d471_le_i32_z_quo", "d471_le_i32_z_tok",
    "d471_le_i64_self_quo", "d471_le_i64_self_tok", "d471_le_i64_z_quo",
    "d471_le_i64_z_tok", "d471_le_litunion_self_quo", "d471_le_litunion_self_tok",
    "d471_le_litunion_z_quo", "d471_le_litunion_z_tok", "d471_le_numunion_self_quo",
    "d471_le_numunion_self_tok", "d471_le_numunion_z_quo", "d471_le_numunion_z_tok",
    "d471_le_string_self_quo", "d471_le_string_self_tok", "d471_le_string_z_quo",
    "d471_le_string_z_tok", "d471_le_typaram_z_quo", "d471_le_typaram_z_tok",
    "d471_lt_f32_self_quo", "d471_lt_f32_self_tok", "d471_lt_f32_z_quo",
    "d471_lt_f32_z_tok", "d471_lt_f64_self_quo", "d471_lt_f64_self_tok",
    "d471_lt_f64_z_quo", "d471_lt_f64_z_tok", "d471_lt_i32_self_quo",
    "d471_lt_i32_self_tok", "d471_lt_i32_z_quo", "d471_lt_i32_z_tok",
    "d471_lt_i64_self_quo", "d471_lt_i64_self_tok", "d471_lt_i64_z_quo",
    "d471_lt_i64_z_tok", "d471_lt_litunion_self_quo", "d471_lt_litunion_self_tok",
    "d471_lt_litunion_z_quo", "d471_lt_litunion_z_tok", "d471_lt_numunion_self_quo",
    "d471_lt_numunion_self_tok", "d471_lt_numunion_z_quo", "d471_lt_numunion_z_tok",
    "d471_lt_string_self_quo", "d471_lt_string_self_tok", "d471_lt_string_z_quo",
    "d471_lt_string_z_tok", "d471_lt_typaram_z_quo", "d471_mul_f32_self_quo",
    "d471_mul_f32_self_tok", "d471_mul_f32_z_quo", "d471_mul_f32_z_tok",
    "d471_mul_f64_self_quo", "d471_mul_f64_self_tok", "d471_mul_f64_z_quo",
    "d471_mul_f64_z_tok", "d471_mul_i32_self_quo", "d471_mul_i32_self_tok",
    "d471_mul_i32_z_quo", "d471_mul_i32_z_tok", "d471_mul_i64_self_quo",
    "d471_mul_i64_self_tok", "d471_mul_i64_z_quo", "d471_mul_i64_z_tok",
    "d471_mul_numunion_self_quo", "d471_mul_numunion_self_tok",
    "d471_mul_numunion_z_quo", "d471_mul_numunion_z_tok", "d471_mul_typaram_z_quo",
    "d471_mul_typaram_z_tok", "d471_pin_alias_i32", "d471_pin_i32",
    "d471_pin_new_i32", "d471_pin_string", "d471_pin_union",
    "d471_pow_i32_self_quo", "d471_pow_i32_self_tok", "d471_pow_i32_z_quo",
    "d471_pow_i32_z_tok", "d471_pow_i64_self_quo", "d471_pow_i64_self_tok",
    "d471_pow_i64_z_quo", "d471_pow_i64_z_tok", "d471_pow_numunion_self_quo",
    "d471_pow_numunion_self_tok", "d471_pow_numunion_z_quo",
    "d471_pow_numunion_z_tok", "d471_pow_typaram_z_quo", "d471_pow_typaram_z_tok",
    "d471_rem_i32_self_quo", "d471_rem_i32_self_tok", "d471_rem_i32_z_quo",
    "d471_rem_i32_z_tok", "d471_rem_i64_self_quo", "d471_rem_i64_self_tok",
    "d471_rem_i64_z_quo", "d471_rem_i64_z_tok", "d471_rem_numunion_self_quo",
    "d471_rem_numunion_self_tok", "d471_rem_numunion_z_quo",
    "d471_rem_numunion_z_tok", "d471_rem_typaram_z_quo", "d471_rem_typaram_z_tok",
    "d471_sub_f32_self_quo", "d471_sub_f32_self_tok", "d471_sub_f32_z_quo",
    "d471_sub_f32_z_tok", "d471_sub_f64_self_quo", "d471_sub_f64_self_tok",
    "d471_sub_f64_z_quo", "d471_sub_f64_z_tok", "d471_sub_i32_self_quo",
    "d471_sub_i32_self_tok", "d471_sub_i32_z_quo", "d471_sub_i32_z_tok",
    "d471_sub_i64_self_quo", "d471_sub_i64_self_tok", "d471_sub_i64_z_quo",
    "d471_sub_i64_z_tok", "d471_sub_numunion_self_quo",
    "d471_sub_numunion_self_tok", "d471_sub_numunion_z_quo",
    "d471_sub_numunion_z_tok", "d471_sub_typaram_z_quo", "d471_sub_typaram_z_tok",
]

BOUNDARY = [
    "d471_add_obj_self_quo", "d471_add_obj_self_tok", "d471_add_objinline_self_quo",
    "d471_add_objinline_self_tok", "d471_add_objnew_self_quo",
    "d471_add_objnew_self_tok", "d471_add_typaram_self_quo",
    "d471_add_typaram_self_tok", "d471_div_obj_self_quo", "d471_div_obj_self_tok",
    "d471_div_objinline_self_quo", "d471_div_objinline_self_tok",
    "d471_div_objnew_self_quo", "d471_div_objnew_self_tok",
    "d471_div_typaram_self_quo", "d471_div_typaram_self_tok",
    "d471_ge_obj_self_quo", "d471_ge_obj_self_tok", "d471_ge_objinline_self_quo",
    "d471_ge_objinline_self_tok", "d471_ge_objnew_self_quo",
    "d471_ge_objnew_self_tok", "d471_ge_typaram_self_quo",
    "d471_ge_typaram_self_tok", "d471_gt_obj_self_quo", "d471_gt_obj_self_tok",
    "d471_gt_objinline_self_quo", "d471_gt_objinline_self_tok",
    "d471_gt_objnew_self_quo", "d471_gt_objnew_self_tok",
    "d471_gt_typaram_self_quo", "d471_gt_typaram_self_tok", "d471_le_obj_self_quo",
    "d471_le_obj_self_tok", "d471_le_objinline_self_quo",
    "d471_le_objinline_self_tok", "d471_le_objnew_self_quo",
    "d471_le_objnew_self_tok", "d471_le_typaram_self_quo",
    "d471_le_typaram_self_tok", "d471_lt_obj_self_quo", "d471_lt_obj_self_tok",
    "d471_lt_objinline_self_quo", "d471_lt_objinline_self_tok",
    "d471_lt_objnew_self_quo", "d471_lt_objnew_self_tok",
    "d471_lt_typaram_self_quo", "d471_mul_obj_self_quo", "d471_mul_obj_self_tok",
    "d471_mul_objinline_self_quo", "d471_mul_objinline_self_tok",
    "d471_mul_objnew_self_quo", "d471_mul_objnew_self_tok",
    "d471_mul_typaram_self_quo", "d471_mul_typaram_self_tok", "d471_pin_inter",
    "d471_pin_obj", "d471_pin_objnew", "d471_pin_typaram", "d471_pin_unannot",
    "d471_pow_obj_self_quo", "d471_pow_obj_self_tok", "d471_pow_objinline_self_quo",
    "d471_pow_objinline_self_tok", "d471_pow_objnew_self_quo",
    "d471_pow_objnew_self_tok", "d471_pow_typaram_self_quo",
    "d471_pow_typaram_self_tok", "d471_rem_obj_self_quo", "d471_rem_obj_self_tok",
    "d471_rem_objinline_self_quo", "d471_rem_objinline_self_tok",
    "d471_rem_objnew_self_quo", "d471_rem_objnew_self_tok",
    "d471_rem_typaram_self_quo", "d471_rem_typaram_self_tok",
    "d471_sub_obj_self_quo", "d471_sub_obj_self_tok", "d471_sub_objinline_self_quo",
    "d471_sub_objinline_self_tok", "d471_sub_objnew_self_quo",
    "d471_sub_objnew_self_tok", "d471_sub_typaram_self_quo",
    "d471_sub_typaram_self_tok",
]


def partition(_base=None):
    """(price, boundary) — the LISTS above, never re-derived from the compiler under
    test. A rule reading current behaviour would pick a different set on either side
    of the landing: before it, the 239 price cells look like any other silently-wrong
    program; after it, they look like any other check reject. That is the whole reason
    `named/` is curated rather than collapsed."""
    return list(PRICE), list(BOUNDARY)


def main():
    seed = os.path.join(R, "build/vl-compiler.wasm")
    for a in sys.argv[1:]:
        if not a.startswith("-"):
            seed = a
    cs = cells(True)

    if "--emit" in sys.argv:
        d = sys.argv[sys.argv.index("--emit") + 1]
        os.makedirs(d, exist_ok=True)
        for n, s in cs.items():
            open(os.path.join(d, n + ".vl"), "w").write(s)
            open(os.path.join(d, n + ".ctl.vl"), "w").write(cells(False)[n])
        print("wrote %d cells + %d controls to %s" % (len(cs), len(cs), d))
        return 0

    base = grade_all(seed)
    price, boundary = partition(base)

    if "--mkset" in sys.argv:
        for n in price + boundary:
            open(os.path.join(NAMED, n + ".vl"), "w").write(cs[n])
        mp = os.path.join(NAMED, "manifest.json")
        m = json.load(open(mp))
        for n in price + boundary:
            m["expect"][n] = expectation(n)
        m["generated"] = len(m["expect"])
        json.dump(m, open(mp, "w"), indent=1, sort_keys=True)
        print("wrote %d cells (%d price + %d boundary) into %s"
              % (len(price) + len(boundary), len(price), len(boundary), NAMED))
        return 0

    if "--price" in sys.argv:
        # THE RUNS-LOST OVERRIDE, EXECUTABLE. `CLAUDE.md` makes `runs` -> not-runs the
        # veto and `DECISIONS.md` makes it overridable only when the lost cells ran by
        # COINCIDENCE rather than by rule. That is a per-cell claim, so it is checked per
        # cell against the seed the cells still ran on, and not argued in prose:
        #
        #   (a) it RAN                          — it is a real loss, not a no-op
        #   (b) output == its DO-NOTHING CONTROL — the declaration contributed NOTHING
        #   (c) output != the DECLARATION's answer
        #                                       — so it printed something its own source
        #                                         contradicts: a WRONG value, not a right one
        #
        # A cell failing (c) was a program that dispatched and was CORRECT, and that is a
        # veto rather than a price. Exit is non-zero if any cell fails any term.
        #
        # The PINS are exempt from (b) and (c) by construction, not by convenience: they
        # have no operator site, so cell and control print the same thing and there is no
        # value for a control to accidentally supply. Their term (1) is stronger, not
        # weaker — deleting the declaration changes nothing they print at all.
        bad_a, bad_b, bad_c = [], [], []
        for n in price:
            v = base[n]
            if not v["cell"][0]:
                bad_a.append(n)
                continue
            if n in PINS:
                continue
            if not (v["ctl"][0] and v["cell"][1] == v["ctl"][1]):
                bad_b.append((n, v["cell"][1], v["ctl"][1]))
            if v["cell"][1] == v["expect"]:
                bad_c.append((n, v["cell"][1], v["expect"]))
        npin = sum(1 for n in price if n in PINS)
        # A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY. Run with the ledger absent
        # (a partial checkout, a bad `git apply`, a rebase that dropped the set) this
        # printed `price cells: 0`, three `0 fail` lines and "override holds", exit 0 --
        # a green result from a population that does not exist, indistinguishable from
        # the check having verified something. That is the do-nothing rule one level up:
        # the rule says a CELL's expected answer must differ from what it would give if
        # the thing under test did nothing; this says the CHECK's own result must differ
        # from what it would give if the check did nothing. Both were violated in one
        # day by authors who had read the other.
        if not price:
            print("price: EMPTY POPULATION -- the ledger lists no price cells, so "
                  "nothing was verified. This is a FAILURE, not an override.")
            return 1
        print("price cells: %d (%d grid + %d pins)  seed %s"
              % (len(price), len(price) - npin, npin, seed))
        print("  (a) ran                            : %d fail" % len(bad_a))
        print("  (b) output == do-nothing control   : %d fail" % len(bad_b))
        print("  (c) output != declaration's answer : %d fail" % len(bad_c))
        for lbl, rows in (("NEVER-RAN", bad_a), ("NOT-INERT", bad_b),
                          ("WAS-CORRECT (VETO)", bad_c)):
            for r in rows[:10]:
                print("  %s %s" % (lbl, r))
        d471 = [n for n in price if n not in PINS and "_z_" in n]
        d425 = [n for n in price if n not in PINS and "_self_" in n]
        print("  split: D471 %d + D425 %d + pins %d = %d"
              % (len(d471), len(d425), npin, len(price)))
        ok = not (bad_a or bad_b or bad_c)
        print("price: %s" % ("every lost cell ran by coincidence and printed a WRONG "
                             "value — override holds" if ok else "VETO"))
        return 0 if ok else 1

    if "--verify" in sys.argv:
        rc = 0
        # (1) THE DISTINGUISHING RULE, run rather than asserted in prose.
        blind = [n for n, v in sorted(base.items())
                 if n not in PINS and v["ctl"][0] and v["ctl"][1] == v["expect"]]
        for n in blind[:20]:
            print("BLIND (control answer == declaration answer): %s" % n)
        print("distinguishing: %d of %d cells blind" % (len(blind), len(base)))
        if blind:
            rc = 1
        # (2) the named/ set is present and byte-identical to what this file generates
        miss = bad = 0
        for n in price + boundary:
            ref = os.path.join(NAMED, n + ".vl")
            if not os.path.exists(ref):
                miss += 1
                print("MISSING FROM named/: %s" % n)
            elif open(ref).read() != cs[n]:
                bad += 1
                print("DIFFERS FROM named/: %s" % n)
        print("named/: %d expected (%d price + %d boundary), %d missing, %d differ"
              % (len(price) + len(boundary), len(price), len(boundary), miss, bad))
        if miss or bad:
            rc = 1
        print("verify: %s" % ("OK" if rc == 0 else "FAILED"))
        return rc

    hist = {}
    for v in base.values():
        hist[v["grade"]] = hist.get(v["grade"], 0) + 1
    print("%d cells: %s" % (len(base), ", ".join(
        "%s=%d" % (k, hist[k]) for k in sorted(hist))), file=sys.stderr)
    json.dump({n: v["grade"] + ":" + v["cell"][1] for n, v in sorted(base.items())},
              sys.stdout, indent=0, sort_keys=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
