#!/usr/bin/env python3
"""
The D131 CONFIRMATION grid.

D131 arrived with its axis already isolated by four one-line controls, so this population
is not a discovery grid: it exists to MEASURE a combination that was already named, and to
carry the negative controls that say the fix moved nothing it had no business moving.

Every cell prints exactly one line and the EXPECTATION IS COMPUTED HERE, from the program
this generator just wrote, never from the compiler — so a module that loads and answers
wrong grades `wrong_value` and not `runs`.  `sweep52.py` is the shared grader, as for every
other grid in this family.

AXES

  recv    THE ISOLATED AXIS: the storage class of the receiver whose FIELD is read.
          local / param / global / hop (a local bound to the read, then returned).
          `param`, `global` and the call form already RUN on master — `structIndexOfExpr`'s
          Ident arm answers for all three — and `local` does not, because that arm reads
          `declaredStructIndex`, a table `buildLocals` fills long after the global return
          pass.  A grid holding `recv` fixed cannot see the row at all.

  body    THE EXECUTING BODY, the axis the row's own third control isolated: a named
          function / MODULE scope / a function nested inside another / a lambda.  Module
          scope RUNS on master for the same read, because no functype is minted for it.

  depth   THE READ: `o.h` (one nested hop) / `o.h.g` (two) / `o.h.r` (the SCALAR leaf).
          The leaf is the row's own side-by-side control — it RUNS on master, because an
          i32 leaf matches the `"i32"` default the classifier fell through to.

  ann     the RETURN ANNOTATION — absent / present non-null / present nullable.  Not a
          decoration: the row records that an explicit non-null annotation MOVES the
          sentence rather than fixing it (`expected (ref $type)` for `expected i32`), which
          is a SECOND rung, and only a grid carrying the axis can say whether one edit
          reached both.

  field   the field's TYPE — an inline shape / a nominal declared struct / a union ARM
          (no `sNames` row at all) / a nullable `S | null` field.  The row's first control
          is that a NOMINAL field reproduces it, so this axis is the control's home.

  claim   the declared CLAIMANTS for the layout `{r: i32}`: none / one / two (a layout
          twin).  The row's second control is that it fires at `decl=nodecl`, so the twin
          axis is here to keep saying so.

  order   the claimant block before or after the code that uses it.

Cells that cannot be written are skipped rather than emitted as noise: a nominal / arm /
nullable field needs a declared name (so `claim=c0` is impossible for them), module scope
has no return annotation and no parameter, and the scalar leaf has no nullable spelling.
"""
import itertools
import os
import sys

DEPTHS = ["d1", "d2", "leaf"]
BODIES = ["fn", "mod", "nested", "lam"]
ANNS = ["none", "nonnul", "nul"]
FIELDS = ["inline", "nominal", "arm", "nulfield"]
RECVS = ["local", "param", "global", "hop"]
CLAIMS = ["c0", "c1", "c2"]
ORDERS = ["before", "after"]


def skip(depth, body, ann, field, recv, claim, order):
    # A nominal / arm / nullable field must NAME a declared type.
    if field != "inline" and claim == "c0":
        return True
    # Module scope mints no functype, so it has no return annotation, and it has no
    # parameters.  `global` at module scope is the same program as `local`.
    if body == "mod" and (ann != "none" or recv in ("param", "global")):
        return True
    # The scalar leaf's result is an i32; `i32 | null` is a different rep (the box) and a
    # different row's question.
    if depth == "leaf" and ann == "nul":
        return True
    # `o.h.r` through a nullable `h` needs `?.`, which is a different construct.
    if depth == "leaf" and field == "nulfield":
        return True
    return False


def inner_ty(field, claim):
    if field == "inline":
        return "{ r: i32 }"
    if field == "nulfield":
        return "Circle | null"
    return "Circle"


def claim_block(field, claim):
    out = []
    if field == "arm":
        out += ["type Circle = { r: i32 }", "type Sq = { s: i32 }",
                "type Shape = Circle | Sq"]
    elif claim != "c0":
        out += ["type Circle = { r: i32 }"]
    if claim == "c2":
        out += ["type Dot = { r: i32 }"]
    return out


def holder_block(depth, it):
    if depth == "d2":
        return [f"type Mid = {{ g: {it} }}", "type Holder = { h: Mid }"]
    return [f"type Holder = {{ h: {it} }}"]


def lit(depth, v):
    return "{ h: { g: { r: %s } } }" % v if depth == "d2" else "{ h: { r: %s } }" % v


def read(depth, recvname):
    if depth == "d1":
        return f"{recvname}.h"
    if depth == "d2":
        return f"{recvname}.h.g"
    return f"{recvname}.h.r"


def ret_ann(depth, ann, field, claim):
    if ann == "none":
        return ""
    if depth == "leaf":
        return ": i32"
    base = "{ r: i32 }" if field == "inline" else "Circle"
    return f": {base}" if ann == "nonnul" else f": {base} | null"


def consume(depth, call, ann, field):
    """The one printed expression, which must evaluate to 7."""
    if depth == "leaf":
        return f"print({call})"
    nullable = ann == "nul" or field == "nulfield"
    if nullable:
        return "print((%s ?? { r: 0 }).r)" % call
    return f"print({call}.r)"


def cell(depth, body, ann, field, recv, claim, order):
    it = inner_ty(field, claim)
    pre = claim_block(field, claim)
    hold = holder_block(depth, it)
    ra = ret_ann(depth, ann, field, claim)
    rd = read(depth, "o")
    # The function's parameter list, its call arguments, and any module-scope receiver.
    globals_ = []
    if recv == "param":
        params, args, decl = "o: Holder", lit(depth, "7"), []
    elif recv == "global":
        params, args, decl = "", "", []
        globals_ = [f"const o: Holder = {lit(depth, '7')}"]
    else:  # local / hop
        params, args, decl = "n: i32", "7", [f"  const o: Holder = {lit(depth, 'n')}"]
    if recv == "hop":
        tail = [f"  const c = {rd}", "  return c"]
    else:
        tail = [f"  return {rd}"]

    if body == "mod":
        # No function at all: the identical read, executed at module scope.
        mo = [f"const o: Holder = {lit(depth, '7')}"]
        if recv == "hop":
            mo += [f"const c = {rd}"]
            val = "c"
        else:
            val = rd
        code = mo + [consume(depth, val, ann, field).replace(
            f"print({val}.r)", f"print({val}.r)")]
        # `consume` builds a CALL expression; at module scope the value is `val` itself.
        code = mo + [consume(depth, val, ann, field)]
        body_lines = hold + code
    elif body == "fn":
        body_lines = hold + [f"function mk({params}){ra} {{"] + decl + tail + ["}"] \
            + globals_ + [consume(depth, f"mk({args})", ann, field)]
        if globals_:
            body_lines = hold + globals_ + [f"function mk({params}){ra} {{"] + decl \
                + tail + ["}"] + [consume(depth, f"mk({args})", ann, field)]
    elif body == "lam":
        body_lines = hold + globals_ + [f"const mk = ({params}){ra} => {{"] + decl \
            + tail + ["}"] + [consume(depth, f"mk({args})", ann, field)]
    else:  # nested — `mk` is declared INSIDE another function, which returns its result
        inner = [f"  function mk({params}){ra} {{"] \
            + ["  " + d for d in decl] + ["  " + t for t in tail] + ["  }"]
        outer = ["function outer(n: i32) {"] + inner \
            + [f"  return mk({args if args else ''})", "}"]
        body_lines = hold + globals_ + outer \
            + [consume(depth, "outer(1)", ann, field)]

    if order == "before":
        out = pre + body_lines
    else:
        out = body_lines + pre
    return "\n".join(out) + "\n", "7"


def main():
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.endswith(".vl") or f == "manifest.tsv":
            os.remove(os.path.join(outdir, f))
    manifest = []
    for depth, body, ann, field, recv, claim, order in itertools.product(
        DEPTHS, BODIES, ANNS, FIELDS, RECVS, CLAIMS, ORDERS
    ):
        if skip(depth, body, ann, field, recv, claim, order):
            continue
        name = "_".join(["d131", depth, body, ann, field, recv, claim, order])
        src, expect = cell(depth, body, ann, field, recv, claim, order)
        with open(os.path.join(outdir, name + ".vl"), "w") as fh:
            fh.write(src)
        manifest.append(name + "\t" + expect)
    with open(os.path.join(outdir, "manifest.tsv"), "w") as fh:
        fh.write("\n".join(sorted(manifest)) + "\n")
    print("cells=%d" % len(manifest))


if __name__ == "__main__":
    main()
