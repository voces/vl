#!/usr/bin/env python3
"""D444 / D445 — the two DECLARATION-SITE shapes of an operator that can never fire.

Two families, one grid, because they are one question asked at two seams and the
answer differs per seam: `is this declaration reachable at all?`

  d444_*  ARITY. A non-index operator declaration at any arity but 2. `checkBinary`
          reaches `opSelfFnTy`, which returns -1 unless the declaration is exactly
          `(self, other)`, and `checkUnaryNode` has no operator lookup at all. So the
          answer does not depend on the receiver — which is what makes this strictly
          stronger than D425, where the receiver is the whole question. The grid
          varies the receiver anyway, precisely to show the column is flat.

  d445_*  RECEIVER. An index operator declaration whose `self` is a type the LANGUAGE
          indexes. `checkIndexNode` asks `tyBuiltinIndexable` and walks past every
          declaration for an array, a map or a string;
          `tests/cases/index/operator-builtin-unaffected.vl` pins that from the use
          side as a deliberate contract. Here the arity is fixed and the RECEIVER is
          the axis, and it is not a two-valued one: `i32`, `f64`, `i64`, `boolean`, a
          newtype over `i32` and a union all DISPATCH today. Only the built-in
          indexable receivers are swallowed, and an alias and a newtype over one are
          swallowed too — which is why the gate cannot read the annotation SPELLING.

EVERY CELL'S BODY DISAGREES WITH THE BUILT-IN ON ITS OWN OPERANDS. A `"[]"` that
returns 99 over an array of 1s, a `-` that returns 99 over `7`. That is not decoration:
it is what makes a cell that starts DISPATCHING visible as a wrong value rather than
invisible, the trap D46's row records and that cost D425's grid eight cells on its
first run. `grade()` therefore records `runs:<stdout>`, never a bare `runs`.

    python3 scripts/silent-sweep/d444/opgrid.py [seed.wasm]      grade to stdout
    python3 scripts/silent-sweep/d444/opgrid.py --emit <dir>     write the cells
    python3 scripts/silent-sweep/d444/opgrid.py --mkset          write named/ (111 cells)
    python3 scripts/silent-sweep/d444/opgrid.py --verify         assert named/ matches
"""
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

# ── D444: arity x operator x receiver ────────────────────────────────────────────────
# The receiver axis exists to show it does NOT matter. `obj` at arity 2 is the one
# combination that dispatches on master and must keep dispatching; `i32` at arity 2 is
# D425's cell and must keep RUNNING inertly until D425 lands its own reject.
D444_RECV = {
    # name: (extra decls, self/other annotation, a value, the right operand)
    "i32": ("", "i32", "7", "1"),
    "f64": ("", "f64", "7.0", "1.0"),
    "obj": ("type V = { x: i32 }\n", "V", "{ x: 7 }", "b"),
}
D444_OPS = ["-", "+", "*", "/", "<"]
D444_ARITY = [0, 1, 2, 3]


def d444(op, arity, recv, quoted):
    """One cell. THE USE SITE IS BUILT FROM `op`, never held fixed: a grid that
    declares `<` and then writes `a - b` measures the SUBTRACTION, which is a
    different program and a different answer. (#2001 lost a whole column of D425's
    grid to the same shape — a wrapper whose own return type reported the mismatch
    instead of the operator's.)"""
    decls, ty, val, rhs = D444_RECV[recv]
    name = '"%s"' % op if quoted else op
    ret = "boolean" if op == "<" else ty
    if op == "<":
        # `true`, NOT `false`. Every operand pair below is `7 <op> 1`, so the native
        # `<` answers FALSE — a declaration that also returned false would grade
        # identically whether it dispatched or was ignored, and the whole grid turns
        # on telling those apart. This cell caught itself: the first run read
        # `runs:false` at BOTH the struct receiver (which must dispatch) and the i32
        # one (which must not), which is exactly no measurement at all.
        body = "true"
    elif recv == "obj":
        body = "{ x: 99 }"
    elif recv == "f64":
        body = "99.0"
    else:
        body = "99"
    params = ["self: " + ty, "other: " + ty, "third: " + ty][:arity]
    src = decls
    src += "function %s(%s): %s { return %s }\n" % (name, ", ".join(params), ret, body)
    src += "const a: %s = %s\n" % (ty, val)
    if recv == "obj":
        src += "const b: %s = %s\n" % (ty, val)
    src += "print(a %s %s)\n" % (op, rhs)
    return src


# ── D445: index operator x receiver ──────────────────────────────────────────────────
# `swallowed` records what master does, so the grid states its own expectation rather
# than re-deriving it from the compiler under test.
D445_RECV = {
    # name: (extra decls, self annotation, key annotation, value expr, use, swallowed)
    "arr":       ("", "i32[]", "i32", "[1, 2]", "print(xs[0])", True),
    "arr_str":   ("", "string[]", "i32", '["a"]', "print(xs[0])", True),
    "str":       ("", "string", "i32", '"abc"', "print(xs[0])", True),
    "map":       ("", "{[string]: i32}", "string", "mkmap()", 'print(xs["k"] ?? -1)', True),
    "alias_arr": ("type Xs = i32[]\n", "Xs", "i32", "[1, 2]", "print(xs[0])", True),
    "new_arr":   ("type Xs = new i32[]\n", "Xs", "i32", "[1, 2]", "print(xs[0])", True),
    "new_str":   ("type Xs = new string\n", "Xs", "i32", '"abc"', "print(xs[0])", True),
    "gen_arr":   ("", "T[]", "i32", "[1, 2]", "print(xs[0])", True),
    # ── the half that DISPATCHES today and must keep dispatching ──
    "i32":       ("", "i32", "i32", "1", "print(xs[0])", False),
    "f64":       ("", "f64", "i32", "1.0", "print(xs[0])", False),
    "i64":       ("", "i64", "i32", "1", "print(xs[0])", False),
    "bool":      ("", "boolean", "i32", "true", "print(xs[0])", False),
    "new_i32":   ("type Xs = new i32\n", "Xs", "i32", "1", "print(xs[0])", False),
    "union":     ("type Xs = i32 | string\n", "Xs", "i32", "1", "print(xs[0])", False),
    "obj":       ("type Xs = { v: i32 }\n", "Xs", "i32", "{ v: 1 }", "print(xs[0])", False),
}

MKMAP = """function mkmap() {
  const m: {[string]: i32} = Map()
  m["k"] = 7
  m
}
"""


def d445(recv, write):
    decls, selfty, keyty, val, use, _sw = D445_RECV[recv]
    src = decls
    if recv == "map":
        src += MKMAP
    tp = "<T>" if recv == "gen_arr" else ""
    # The READ operator is declared in every cell: a write-only `"[]="` is its own
    # diagnostic ("an index that cannot be READ cannot be written either") and would
    # measure that rule instead of this one.
    src += 'function "[]"%s(self: %s, i: %s): i32 { return 99 }\n' % (tp, selfty, keyty)
    if write:
        src += 'function "[]="%s(self: %s, i: %s, v: i32) { print(9999) }\n' % (
            tp, selfty, keyty)
    src += "const xs: %s = %s\n" % (selfty if recv != "gen_arr" else "i32[]", val)
    if write:
        src += ("xs[%s] = 5\n" % ("0" if keyty == "i32" else '"k"'))
    src += use + "\n"
    return src


def cells():
    """name -> source, for every cell in both families."""
    out = {}
    for op in D444_OPS:
        for ar in D444_ARITY:
            for recv in D444_RECV:
                for q in (False, True):
                    nm = "d444_%s_a%d_%s%s" % (
                        {"-": "sub", "+": "add", "*": "mul", "/": "div", "<": "lt"}[op],
                        ar, recv, "_q" if q else "")
                    out[nm] = d444(op, ar, recv, q)
    for recv in D445_RECV:
        for write in (False, True):
            out["d445_%s%s" % (recv, "_w" if write else "")] = d445(recv, write)
    return out


# ── the NAMED set ────────────────────────────────────────────────────────────────────
# LISTED, not re-derived. The set is what this grid named on master `1a43607c`; a rule
# reading the CLOSING compiler's behaviour would pick a different set, because on the
# closing compiler the price cells are refusals indistinguishable from hundreds of
# their neighbours. That is the whole reason `named/` is curated rather than collapsed.
#
# PRICE — 75 cells the landing moves. 73 `runs` -> `check_reject` and 2 `emit_reject`
# -> `check_reject`. Every one of them RAN only because its own declaration was dead:
# the body says 99 (or `true`, or `{x: 99}`) and the program printed the built-in's
# answer. They are the override argument for the runs-lost veto, written down.
PRICE = [
    "d444_add_a0_f64", "d444_add_a0_f64_q", "d444_add_a0_i32", "d444_add_a0_i32_q",
    "d444_add_a1_f64", "d444_add_a1_f64_q", "d444_add_a1_i32", "d444_add_a1_i32_q",
    "d444_add_a3_f64", "d444_add_a3_f64_q", "d444_add_a3_i32", "d444_add_a3_i32_q",
    "d444_div_a0_f64", "d444_div_a0_f64_q", "d444_div_a0_i32", "d444_div_a0_i32_q",
    "d444_div_a1_f64", "d444_div_a1_f64_q", "d444_div_a1_i32", "d444_div_a1_i32_q",
    "d444_div_a3_f64", "d444_div_a3_f64_q", "d444_div_a3_i32", "d444_div_a3_i32_q",
    "d444_lt_a0_f64", "d444_lt_a0_f64_q", "d444_lt_a0_i32", "d444_lt_a0_i32_q",
    "d444_lt_a1_f64", "d444_lt_a1_f64_q", "d444_lt_a1_i32", "d444_lt_a1_i32_q",
    "d444_lt_a3_f64", "d444_lt_a3_f64_q", "d444_lt_a3_i32", "d444_lt_a3_i32_q",
    "d444_mul_a0_f64", "d444_mul_a0_f64_q", "d444_mul_a0_i32", "d444_mul_a0_i32_q",
    "d444_mul_a1_f64", "d444_mul_a1_f64_q", "d444_mul_a1_i32", "d444_mul_a1_i32_q",
    "d444_mul_a3_f64", "d444_mul_a3_f64_q", "d444_mul_a3_i32", "d444_mul_a3_i32_q",
    "d444_sub_a0_f64", "d444_sub_a0_f64_q", "d444_sub_a0_i32", "d444_sub_a0_i32_q",
    "d444_sub_a1_f64", "d444_sub_a1_f64_q", "d444_sub_a1_i32", "d444_sub_a1_i32_q",
    "d444_sub_a3_f64", "d444_sub_a3_f64_q", "d444_sub_a3_i32", "d444_sub_a3_i32_q",
    "d445_alias_arr", "d445_alias_arr_w", "d445_arr", "d445_arr_str", "d445_arr_w",
    "d445_gen_arr", "d445_gen_arr_w", "d445_map", "d445_map_w", "d445_new_arr",
    "d445_new_arr_w", "d445_new_str", "d445_new_str_w", "d445_str", "d445_str_w",
]

# BOUNDARY — 36 cells that RUN on master and RUN unchanged on the landing, printing the
# identical stdout. They are the more important half. A price set alone says what a
# candidate cost; it cannot say the candidate stopped where it was supposed to. These
# say it at both seams:
#
#   d444_*_a2_*   arity 2 is D425's territory, not this gate's. The 8 built-in-receiver
#                 cells print the NATIVE answer (D425, still open, still inert) and the
#                 2 struct ones print the DECLARATION's (dispatch, must never break).
#                 `d444_lt_a2_obj` = `runs:true` against `d444_lt_a2_i32` = `runs:false`
#                 is the single comparison that separates dispatch from inertness here.
#   d445_*        every receiver that is NOT built-in indexable — i32, f64, i64,
#                 boolean, a newtype over i32, a union, a struct — dispatches today and
#                 prints 99. The row's TITLE said "a non-object `self`" and these 14
#                 cells are why that was wrong: six non-object receivers dispatch fine.
BOUNDARY = [
    "d444_add_a2_f64", "d444_add_a2_f64_q", "d444_add_a2_i32", "d444_add_a2_i32_q",
    "d444_div_a2_f64", "d444_div_a2_f64_q", "d444_div_a2_i32", "d444_div_a2_i32_q",
    "d444_lt_a2_f64", "d444_lt_a2_f64_q", "d444_lt_a2_i32", "d444_lt_a2_i32_q",
    "d444_lt_a2_obj", "d444_lt_a2_obj_q", "d444_mul_a2_f64", "d444_mul_a2_f64_q",
    "d444_mul_a2_i32", "d444_mul_a2_i32_q", "d444_sub_a2_f64", "d444_sub_a2_f64_q",
    "d444_sub_a2_i32", "d444_sub_a2_i32_q", "d445_bool", "d445_bool_w", "d445_f64",
    "d445_f64_w", "d445_i32", "d445_i32_w", "d445_i64", "d445_i64_w", "d445_new_i32",
    "d445_new_i32_w", "d445_obj", "d445_obj_w", "d445_union", "d445_union_w",
]

# The other 39 cells of the 150 are a loud check reject on BOTH compilers — an arity-0
# `-` over a struct was already `unary '-' expects a numeric type`, and so on. They are
# deliberately NOT in the set: a cell that behaves like its class-mates on both sides of
# the change carries nothing `cells/` does not already carry.


def grade(src, compiler):
    with tempfile.NamedTemporaryFile("w", suffix=".vl", delete=False, dir="/tmp") as f:
        f.write(src)
        p = f.name
    try:
        ck = subprocess.run([VL, "check", p, "--compiler", compiler],
                            capture_output=True, text=True)
        if ck.returncode != 0:
            return "check_reject"
        rn = subprocess.run([VL, "run", p, "--compiler", compiler],
                            capture_output=True, text=True)
        err = (ck.stderr + rn.stderr).strip()
        if rn.returncode != 0:
            if "emitProgram" in err or "compiler emit bug" in err or "unsupported" in err:
                return "emit_reject"
            if "not a valid WebAssembly" in err or "type mismatch" in err:
                return "invalid_wasm"
            return "trap"
        # THE STDOUT IS THE MEASUREMENT, not the exit code — see the module docstring.
        return "runs:" + rn.stdout.strip().replace("\n", "|")
    finally:
        os.unlink(p)


def main():
    cs = cells()
    if "--emit" in sys.argv:
        d = sys.argv[sys.argv.index("--emit") + 1]
        os.makedirs(d, exist_ok=True)
        for nm, src in cs.items():
            open(os.path.join(d, nm + ".vl"), "w").write(src)
        print("wrote %d cells to %s" % (len(cs), d))
        return 0
    if "--mkset" in sys.argv:
        for nm in PRICE + BOUNDARY:
            open(os.path.join(NAMED, nm + ".vl"), "w").write(cs[nm])
        print("wrote %d cells (%d price + %d boundary) into %s"
              % (len(PRICE) + len(BOUNDARY), len(PRICE), len(BOUNDARY), NAMED))
        return 0
    if "--verify" in sys.argv:
        want = set(PRICE + BOUNDARY)
        checked = bad = missing = 0
        for nm, src in sorted(cs.items()):
            ref = os.path.join(NAMED, nm + ".vl")
            if not os.path.exists(ref):
                if nm in want:
                    missing += 1
                    print("MISSING FROM named/: %s" % nm)
                continue
            checked += 1
            if open(ref).read() != src:
                bad += 1
                print("DIFFERS FROM named/: %s" % nm)
        print("verify: %d of %d cells present in named/ (%d expected), %d differ, %d missing"
              % (checked, len(cs), len(want), bad, missing))
        return 1 if (bad or missing) else 0
    compiler = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") \
        else os.path.join(R, "build/vl-compiler.wasm")
    out = {nm: grade(src, compiler) for nm, src in sorted(cs.items())}
    json.dump(out, sys.stdout, indent=0, sort_keys=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
