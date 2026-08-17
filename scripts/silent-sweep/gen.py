#!/usr/bin/env python3
"""
Representation x position x construct x runtime-input sweep generator for the VL compiler.

Emits one self-contained .vl program per CELL plus a manifest recording, for each cell,
the INDEPENDENTLY COMPUTED expected stdout (value lines + a trailing evaluation-count
line).  Nothing here consults the compiler: the expectation comes from the semantics of
the program the generator just wrote.

Every cell:
  * calls its producer `src()` EXACTLY ONCE, so the trailing `print(nCalls)` line is a
    hard evaluation-count oracle (expected: 1).
  * is generated for BOTH runtime inputs (present value / null-or-other-variant).
  * has a control: the same (rep, position, construct) cell on the `plain` leg.

Usage: gen.py <outdir>
"""
import json, os, sys

# ---------------------------------------------------------------- rep vocabulary
# Each rep: the payload type T.  With nul=True the cell's carried type is `T | null`.
#   decls     : module-scope declarations the rep needs
#   vals      : two distinct present values [(expr, printed), (expr, printed)]
#   isbase    : type spelling for an `is` test
#   reads     : ordered read forms; each (name, template, expected-fn)
#                 template uses {E}; expected-fn(valueindex) -> printed string
#   coal      : (default expr, printed default) for `??`, or None
#   printable : print(E) directly renders the value
#   eqlit     : literal for `E == <lit>` (compares equal for value index 0)
REPS = {}

def rep(name, ty, decls, vals, isbase, reads, coal=None, printable=False, eqlit=None,
        family="scalar", ismatch=(0, 1)):
    # ismatch: which value indices actually SATISFY `is <isbase>`.  For a union rep the
    # second value is a different member, so the `is` arm legitimately declines — getting
    # this wrong is a HARNESS error that reads as a silently-wrong value.
    REPS[name] = dict(name=name, ty=ty, decls=decls, vals=vals, isbase=isbase, reads=reads,
                      coal=coal, printable=printable, eqlit=eqlit, family=family,
                      ismatch=tuple(ismatch))

# --- plain scalars -----------------------------------------------------------
rep("i32", "i32", [], [("7", "7"), ("8", "8")], "i32",
    [("print", "print({E})", lambda i: ["7", "8"][i]),
     ("plus", "print({E} + 1)", lambda i: ["8", "9"][i])],
    coal=("0", "0"), printable=True, eqlit="7")
rep("i64", "i64", [], [("70", "70"), ("80", "80")], "i64",
    [("print", "print({E})", lambda i: ["70", "80"][i]),
     ("plus", "print({E} + 1)", lambda i: ["71", "81"][i])],
    coal=("0", "0"), printable=True, eqlit="70")
rep("f64", "f64", [], [("7.25", "7.25"), ("8.75", "8.75")], "f64",
    [("print", "print({E})", lambda i: ["7.25", "8.75"][i]),
     ("plus", "print({E} + 0.5)", lambda i: ["7.75", "9.25"][i])],
    coal=("0.5", "0.5"), printable=True, eqlit="7.25")
rep("f32", "f32", [], [("7.25", "7.25"), ("8.75", "8.75")], "f32",
    [("print", "print({E})", lambda i: ["7.25", "8.75"][i])],
    coal=("0.5", "0.5"), printable=True, eqlit="7.25")
rep("boolean", "boolean", [], [("true", "true"), ("false", "false")], "boolean",
    [("print", "print({E})", lambda i: ["true", "false"][i])],
    coal=("false", "false"), printable=True, eqlit="true")
rep("string", "string", [], [('"aa"', "aa"), ('"bb"', "bb")], "string",
    [("print", "print({E})", lambda i: ["aa", "bb"][i]),
     ("len", "print({E}.length)", lambda i: ["2", "2"][i]),
     ("plus", 'print({E} + "!")', lambda i: ["aa!", "bb!"][i])],
    coal=('"DD"', "DD"), printable=True, eqlit='"aa"')

# --- literal unions ---------------------------------------------------------
rep("namedlit", "K", ['type K = "p" | "q"'], [('"p"', "p"), ('"q"', "q")], "K",
    [("print", "print({E})", lambda i: ["p", "q"][i]),
     ("eqchain", 'if {E} == "p" {{ print("P") }} else {{ print("Q") }}',
      lambda i: ["P", "Q"][i])],
    coal=('"q"', "q"), printable=True, eqlit='"p"', family="litunion")
rep("inlinelit", '"p" | "q"', [], [('"p"', "p"), ('"q"', "q")], '"p" | "q"',
    [("print", "print({E})", lambda i: ["p", "q"][i]),
     ("eqchain", 'if {E} == "p" {{ print("P") }} else {{ print("Q") }}',
      lambda i: ["P", "Q"][i])],
    coal=('"q"', "q"), printable=True, eqlit='"p"', family="litunion")
rep("numlit", "N2", ["type N2 = 1 | 2"], [("1", "1"), ("2", "2")], "N2",
    [("print", "print({E})", lambda i: ["1", "2"][i]),
     ("eqchain", 'if {E} == 1 {{ print("P") }} else {{ print("Q") }}',
      lambda i: ["P", "Q"][i])],
    coal=("2", "2"), printable=True, eqlit="1", family="litunion")

# --- value-union box / struct union -----------------------------------------
rep("vubox", "string | i32", [], [('"aa"', "aa"), ("7", "7")], "string",
    [("isarm", 'if {E} is string {{ print({E}) }} else {{ print({E}) }}',
      lambda i: ["aa", "7"][i])],
    family="union", ismatch=(0,))
rep("structunion", "Shape",
    ["type Cat = { c: i32 }", "type Dog = { d: i32 }", "type Shape = Cat | Dog"],
    [("{ c: 1 }", "1"), ("{ d: 2 }", "2")], "Cat",
    [("isarm", "if {E} is Cat {{ print({E}.c) }} else {{ print({E}.d) }}",
      lambda i: ["1", "2"][i]),
     ("matcharm", "match {E} {{ Cat => {{ print({E}.c) }} Dog => {{ print({E}.d) }} }}",
      lambda i: ["1", "2"][i])],
    family="union", ismatch=(0,))

# --- struct -----------------------------------------------------------------
rep("struct", "S", ["type S = { w: i32 }"],
    [("{ w: 5 }", "5"), ("{ w: 6 }", "6")], "S",
    [("field", "print({E}.w)", lambda i: ["5", "6"][i])], family="ref")

# --- lists ------------------------------------------------------------------
def listrep(name, ty, decls, a, b, alen, blen, a0, b0, idxable=True):
    reads = [("len", "print({E}.length)", lambda i, al=alen, bl=blen: [al, bl][i])]
    if idxable:
        reads.append(("idx", "print({E}[0])", lambda i, x=a0, y=b0: [x, y][i]))
    reads.append(("mapm", "print({E}.map((z) => z).length)",
                  lambda i, al=alen, bl=blen: [al, bl][i]))
    reads.append(("filterm", "print({E}.filter((z) => true).length)",
                  lambda i, al=alen, bl=blen: [al, bl][i]))
    rep(name, ty, decls, [(a, alen), (b, blen)], ty, reads, family="list")

listrep("list_i32", "i32[]", [], "[1, 2]", "[3]", "2", "1", "1", "3")
listrep("list_str", "string[]", [], '["a", "b"]', '["c"]', "2", "1", "a", "c")
listrep("list_f64", "f64[]", [], "[1.25, 2.25]", "[3.25]", "2", "1", "1.25", "3.25")
listrep("list_i64", "i64[]", [], "[10, 20]", "[30]", "2", "1", "10", "30")
listrep("list_f32", "f32[]", [], "[1.25, 2.25]", "[3.25]", "2", "1", "1.25", "3.25")
rep("list_ref", "S[]", ["type S = { w: i32 }"],
    [("[{ w: 1 }, { w: 2 }]", "2"), ("[{ w: 3 }]", "1")], "S[]",
    [("len", "print({E}.length)", lambda i: ["2", "1"][i]),
     ("idx", "print({E}[0].w)", lambda i: ["1", "3"][i])], family="list")

# --- closure ----------------------------------------------------------------
rep("closure", "(i32) => i32", [],
    [("(x) => x + 1", "4"), ("(x) => x + 2", "5")], "(i32) => i32",
    [("call", "print({E}(3))", lambda i: ["4", "5"][i])], family="closure")

# --- maps -------------------------------------------------------------------
rep("map_str", "{[string]: i32}", [],
    [("mkMapA()", "2"), ("mkMapB()", "1")], "{[string]: i32}",
    [("size", "print({E}.size)", lambda i: ["2", "1"][i]),
     ("valsum", "for zz in {E}.values() {{ print(zz) }}",
      lambda i: ["5\n6", "9"][i]),
     ("coal", 'print({E}["k"] ?? 0)', lambda i: ["5", "9"][i])],
    family="map")
rep("map_i32", "{[i32]: string}", [],
    [("mkMapC()", "2"), ("mkMapD()", "1")], "{[i32]: string}",
    [("size", "print({E}.size)", lambda i: ["2", "1"][i]),
     ("valsum", "for zz in {E}.values() {{ print(zz) }}",
      lambda i: ["x\ny", "z"][i])],
    family="map")

MAP_HELPERS = """function mkMapA(): {[string]: i32} {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  m["j"] = 6
  return m
}
function mkMapB(): {[string]: i32} {
  const m: {[string]: i32} = Map()
  m["k"] = 9
  return m
}
function mkMapC(): {[i32]: string} {
  const m: {[i32]: string} = Map()
  m[1] = "x"
  m[2] = "y"
  return m
}
function mkMapD(): {[i32]: string} {
  const m: {[i32]: string} = Map()
  m[1] = "z"
  return m
}"""

# --------------------------------------------------------------- element types
def elem_ty(rep_name, nul):
    """The type spelling for a LIST ELEMENT / MAP VALUE / FIELD of this rep."""
    t = REPS[rep_name]["ty"]
    if nul:
        return "(" + t + " | null)"
    if REPS[rep_name]["family"] in ("union", "litunion") and rep_name == "inlinelit":
        return "(" + t + ")"
    if rep_name == "vubox":
        return "(" + t + ")"
    return t

def carried_ty(rep_name, nul):
    t = REPS[rep_name]["ty"]
    return (t + " | null") if nul else t

# ------------------------------------------------------------------ positions
# Each returns (module_lines, body_lines_prefix, access_expr, wrap_in_fn_name)
# The construct's lines are appended inside the function body named by wrap.
POSITIONS = [
    "const_local", "let_local", "param", "ret_unann", "ret_ann", "global",
    "field", "elem", "mapval", "capture", "loopvar", "callres",
    # PLACE positions: the narrowing test and the read both name the PLACE itself,
    # with no copy into a local.
    "field_place", "elem_place", "mapval_place",
    # the nullability comes from the MAP-INDEX READ, not from a declared `| null`
    "mapget",
]

def build(rep_name, nul, pos, con_name, read_name, inp, outdir, idx, spell="inline"):
    R = REPS[rep_name]
    ty = carried_ty(rep_name, nul)
    ety = elem_ty(rep_name, nul)
    alias_decl = None
    if spell == "alias" and nul:
        alias_decl = f"type NulAlias = {R['ty']} | null"
        ty = "NulAlias"
        ety = "NulAlias"
    vexpr, _ = R["vals"][0 if not nul else 0]
    # runtime input: 0 = present (value A), 1 = absent (null) or value B on the plain leg
    if nul:
        if inp == 0:
            retv, vidx = R["vals"][0][0], 0
            present = True
        else:
            retv, vidx = "null", None
            present = False
    else:
        retv, vidx = R["vals"][inp][0], inp
        present = True

    decls = list(R["decls"])
    need_maps = R["family"] == "map" or rep_name in ("map_str", "map_i32")
    pre = []          # module-level lines
    body = []         # lines inside the reading function
    access = None
    fnname = "reader"

    if pos == "const_local":
        body.append(f"  const v: {ty} = src()")
        access = "v"
    elif pos == "let_local":
        body.append(f"  let v: {ty} = src()")
        access = "v"
    elif pos == "param":
        access = "v"
    elif pos == "ret_unann":
        pre.append(f"function mk(): {ty} {{ return src() }}")
        body.append("  const v = mk()")
        access = "v"
    elif pos == "ret_ann":
        pre.append(f"function mk(): {ty} {{ return src() }}")
        body.append(f"  const v: {ty} = mk()")
        access = "v"
    elif pos == "global":
        pre.append(f"const gv: {ty} = src()")
        access = "gv"
    elif pos == "field":
        decls.append(f"type Wrap = {{ f: {ety} }}")
        body.append(f"  const w: Wrap = {{ f: src() }}")
        body.append("  const v = w.f")
        access = "v"
    elif pos == "elem":
        body.append(f"  const xs: {ety}[] = [src()]")
        body.append("  const v = xs[0]")
        access = "v"
    elif pos == "mapval":
        body.append(f"  const mm: {{[string]: {ety}}} = Map()")
        body.append('  mm["kk"] = src()')
        body.append('  const v = mm["kk"]')
        access = "v"
    elif pos == "capture":
        body.append(f"  const v0: {ty} = src()")
        body.append("  function innerRead() {")
        body.append("__CONSTRUCT_INDENTED__")
        body.append("  }")
        body.append("  innerRead()")
        access = "v0"
    elif pos == "loopvar":
        body.append(f"  const xs: {ety}[] = [src()]")
        body.append("  for v in xs {")
        body.append("__CONSTRUCT_INDENTED__")
        body.append("  }")
        access = "v"
    elif pos == "callres":
        pre.append(f"function mk(): {ty} {{ return src() }}")
        access = "mk()"
    elif pos == "field_place":
        decls.append(f"type Wrap = {{ f: {ety} }}")
        body.append(f"  const w: Wrap = {{ f: src() }}")
        access = "w.f"
    elif pos == "elem_place":
        body.append(f"  const xs: {ety}[] = [src()]")
        access = "xs[0]"
    elif pos == "mapval_place":
        body.append(f"  const mm: {{[string]: {ety}}} = Map()")
        body.append('  mm["kk"] = src()')
        access = 'mm["kk"]'
    elif pos == "mapget":
        # the map's VALUE type is the PLAIN payload; the `| null` comes from the index
        # read alone.  Runtime input 1 is a MISSING key, so the read really is null.
        if not nul or spell == "alias":
            return None
        plain = elem_ty(rep_name, False)
        body.append(f"  const mm: {{[string]: {plain}}} = Map()")
        body.append('  mm["kk"] = src()')
        key = '"kk"' if inp == 0 else '"zz"'
        body.append(f"  const v = mm[{key}]")
        access = "v"
    else:
        return None

    # ---- construct lines + expected value lines
    got = construct(R, con_name, read_name, access, nul, present, vidx)
    if got is None:
        return None
    clines, expected_vals = got

    # splice
    if "__CONSTRUCT_INDENTED__" in body:
        i = body.index("__CONSTRUCT_INDENTED__")
        body = body[:i] + ["  " + l for l in clines] + body[i + 1:]
    else:
        body = body + clines

    # `mapget` stores a PLAIN value; its null comes from a missing-key read, so the
    # producer's own type and return value are the non-nullable ones.
    src_ty, src_ret = ty, retv
    if pos == "mapget":
        src_ty, src_ret = elem_ty(rep_name, False), R["vals"][0][0]

    src_lines = []
    src_lines.append("let nCalls = 0")
    src_lines.append(f"function src(): {src_ty} {{ nCalls = nCalls + 1")
    src_lines.append(f"  return {src_ret} }}")

    lines = []
    lines += decls
    if alias_decl:
        lines.append(alias_decl)
    if need_maps:
        lines.append(MAP_HELPERS)
    lines += src_lines
    lines += pre
    if pos == "param":
        lines.append(f"function {fnname}(v: {ty}) {{")
        lines += body
        lines.append("}")
        lines.append(f"{fnname}(src())")
    else:
        lines.append(f"function {fnname}() {{")
        lines += body
        lines.append("}")
        lines.append(f"{fnname}()")
    lines.append("print(nCalls)")

    expected = expected_vals + ["1"]
    return "\n".join(lines) + "\n", expected


def readform(R, read_name, E, vidx):
    """(lines, expected-lines) for reading a value KNOWN non-null / of value index vidx."""
    for (nm, tmpl, exp) in R["reads"]:
        if nm == read_name:
            code = tmpl.format(E=E)
            out = exp(vidx)
            return ["  " + code], out.split("\n")
    return None


def construct(R, con, read_name, E, nul, present, vidx):
    """Return (lines, expected_value_lines) or None if the combination is not generated."""
    rd = None
    if present:
        rd = readform(R, read_name, E, vidx)
        if rd is None:
            return None
    # a read used only for its SHAPE (present branch) when the runtime input is absent
    shape = readform(R, read_name, E, 0)
    if shape is None:
        return None

    if not nul:
        # ---------------- plain leg ----------------
        if con == "direct":
            return rd[0], rd[1]
        if con == "is_t":
            base = R["isbase"]
            ls = [f"  if {E} is {base} {{"] + ["  " + l for l in rd[0]] + \
                 ['  } else { print("OTHERARM") }']
            # a union rep's SECOND value is a different member, so the `is` arm
            # legitimately declines: the expectation is the else arm, not the read.
            if vidx in R["ismatch"]:
                return ls, rd[1]
            return ls, ["OTHERARM"]
        if con == "eqcmp":
            if R["eqlit"] is None:
                return None
            ls = [f"  print({E} == {R['eqlit']})"]
            return ls, ["true" if vidx == 0 else "false"]
        if con == "coalesce":
            if R["coal"] is None:
                return None
            return [f"  print({E} ?? {R['coal'][0]})"], [R["vals"][vidx][1]]
        if con == "printdirect":
            if not R["printable"]:
                return None
            return [f"  print({E})"], [R["vals"][vidx][1]]
        return None

    # ---------------- nullable leg ----------------
    if con == "nenull":
        ls = [f"  if {E} != null {{"] + ["  " + l for l in shape[0]] + \
             ['  } else { print("NUL") }']
        return ls, (rd[1] if present else ["NUL"])
    if con == "eqnull_else":
        ls = [f"  if {E} == null {{ print(\"NUL\") }} else {{"] + \
             ["  " + l for l in shape[0]] + ["  }"]
        return ls, (rd[1] if present else ["NUL"])
    if con == "is_t":
        base = R["isbase"]
        ls = [f"  if {E} is {base} {{"] + ["  " + l for l in shape[0]] + \
             ['  } else { print("NUL") }']
        return ls, (rd[1] if present else ["NUL"])
    if con == "match_null":
        ls = [f"  match {E} {{", '    null => { print("NUL") }', "    _ => {"] + \
             ["    " + l for l in shape[0]] + ["    }", "  }"]
        return ls, (rd[1] if present else ["NUL"])
    if con == "andguard":
        # a boolean-valued guard; uses the rep's eq literal where it has one
        if R["eqlit"] is None:
            return None
        ls = [f"  print({E} != null && {E} == {R['eqlit']})"]
        if not present:
            return ls, ["false"]
        return ls, ["true" if vidx == 0 else "false"]
    if con == "coalesce":
        if R["coal"] is None:
            return None
        ls = [f"  print({E} ?? {R['coal'][0]})"]
        return ls, ([R["vals"][vidx][1]] if present else [R["coal"][1]])
    if con == "printdirect":
        if not R["printable"]:
            return None
        return [f"  print({E})"], ([R["vals"][vidx][1]] if present else ["null"])
    if con == "eqnullcmp":
        return [f"  print({E} == null)"], (["false"] if present else ["true"])
    if con == "while_g":
        ls = [f"  let wn = 0",
              f"  while {E} != null && wn < 1 {{"] + ["  " + l for l in shape[0]] + \
             ["    wn = wn + 1", "  }",
              '  if wn == 0 { print("NUL") }']
        return ls, (rd[1] if present else ["NUL"])
    if con == "optchain":
        # `?.` on the rep's primary member, then a `??` to make the result printable
        oc = OPTCHAIN.get(R["name"])
        if oc is None:
            return None
        prop, dflt, dstr, pstr = oc
        ls = [f"  const oc = {E}?.{prop}", f"  print(oc ?? {dflt})"]
        return ls, ([pstr[vidx]] if present else [dstr])
    return None


# rep -> (property, default expr, printed default, [printed value per value index])
OPTCHAIN = {
    "struct": ("w", "0", "0", ["5", "6"]),
    "list_i32": ("length", "0", "0", ["2", "1"]),
    "list_str": ("length", "0", "0", ["2", "1"]),
    "string": ("length", "0", "0", ["2", "2"]),
    "map_str": ("size", "0", "0", ["2", "1"]),
    "list_ref": ("length", "0", "0", ["2", "1"]),
}


NUL_CONS = ["nenull", "eqnull_else", "is_t", "match_null", "andguard",
            "coalesce", "printdirect", "eqnullcmp", "while_g", "optchain"]
PLAIN_CONS = ["direct", "is_t", "eqcmp", "coalesce", "printdirect"]
# constructs that mention the access expression EXACTLY ONCE (safe at `callres`)
SINGLE_OCCURRENCE = {"coalesce", "printdirect", "eqnullcmp", "direct", "eqcmp"}
VALUE_POSITIONS = ["const_local", "let_local", "param", "ret_unann", "ret_ann",
                   "global", "field", "elem", "mapval", "capture", "loopvar"]
PLACE_POSITIONS = ["field_place", "elem_place", "mapval_place"]
ALIAS_POSITIONS = ["const_local", "param", "ret_ann", "global", "field", "elem",
                   "mapval", "capture", "loopvar"]


def single_mention_reads(R):
    return [nm for (nm, t, _e) in R["reads"] if t.count("{E}") == 1]


def main():
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    cells = {}
    n = 0
    skipped = []

    def emit(leg, rep_name, nul, pos, con, read_name, inp, spell="inline"):
        nonlocal n
        got = build(rep_name, nul, pos, con, read_name, inp, outdir, n, spell)
        if got is None:
            skipped.append([leg, rep_name, int(nul), pos, con, read_name, inp, spell])
            return
        text, expected = got
        name = f"c{n:05d}"
        with open(os.path.join(outdir, name + ".vl"), "w") as fh:
            fh.write(text)
        cells[name] = dict(leg=leg, rep=rep_name, nul=int(nul), pos=pos, con=con,
                           read=read_name, inp=inp, spell=spell, expected=expected)
        n += 1

    # ---- Leg A: rep x nullability x construct x position x input, primary read
    for rep_name, R in REPS.items():
        primary = R["reads"][0][0]
        for nul in (False, True):
            cons = NUL_CONS if nul else PLAIN_CONS
            for pos in VALUE_POSITIONS:
                for con in cons:
                    for inp in (0, 1):
                        emit("A", rep_name, nul, pos, con, primary, inp)

    # ---- Leg B: rep x read-form x {nenull|direct} at const_local, both inputs
    for rep_name, R in REPS.items():
        for (nm, _t, _e) in R["reads"][1:]:
            for nul in (False, True):
                con = "nenull" if nul else "direct"
                for inp in (0, 1):
                    emit("B", rep_name, nul, "const_local", con, nm, inp)

    # ---- Leg C: evaluation count — the value used DIRECTLY from a call result
    for rep_name, R in REPS.items():
        primary = R["reads"][0][0]
        for nul in (False, True):
            cons = [c for c in (NUL_CONS if nul else PLAIN_CONS)
                    if c in SINGLE_OCCURRENCE]
            for con in cons:
                for inp in (0, 1):
                    emit("C", rep_name, nul, "callres", con, primary, inp)

    # ---- Leg D: evaluation count across every SINGLE-MENTION read form, on a call
    #      result.  A value-correct cell whose callee ran twice fails here.
    for rep_name, R in REPS.items():
        for nm in single_mention_reads(R):
            for inp in (0, 1):
                emit("D", rep_name, False, "callres", "direct", nm, inp)

    # ---- Leg E: the DECLARED-ALIAS vs INLINE spelling of a nullable (audit row R1)
    for rep_name, R in REPS.items():
        primary = R["reads"][0][0]
        for spell in ("inline", "alias"):
            for pos in ALIAS_POSITIONS:
                for con in ("nenull", "eqnull_else", "is_t", "coalesce", "printdirect"):
                    for inp in (0, 1):
                        emit("E", rep_name, True, pos, con, primary, inp, spell)

    # ---- Leg F: PLACE narrowing (no copy into a local) + the map-index-read nullable
    for rep_name, R in REPS.items():
        primary = R["reads"][0][0]
        for pos in PLACE_POSITIONS + ["mapget"]:
            for con in ("nenull", "eqnull_else", "is_t", "match_null", "coalesce",
                        "printdirect"):
                for inp in (0, 1):
                    emit("F", rep_name, True, pos, con, primary, inp)

    with open(os.path.join(outdir, "manifest.json"), "w") as fh:
        json.dump(dict(cells=cells, skipped=skipped), fh)
    print(f"generated {n} cells, {len(skipped)} skipped combinations")


if __name__ == "__main__":
    main()
