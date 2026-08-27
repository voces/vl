#!/usr/bin/env python3
"""
The D75 / D81 / D82 grid generator.

One arm-typed value travels from a SOURCE cell to a DESTINATION, in a program that may
also declare a layout TWIN, over one of four ROUTES.  Every cell prints exactly one line,
`7`, computed from the program's own semantics and never from the compiler.

  decl   arm | arm2 | plain | nounion
                                -- the PRELUDE, varied rather than held fixed.  `arm2`
                                   declares TWO unions containing `Circle`, which is the
                                   0/1/2 pairing axis on the declaration that matters:
                                   a one-per-program grid structurally cannot see a
                                   pairing defect.  `plain` has no union at all and
                                   `nounion` has one that does NOT contain `Circle`, so
                                   union-ness is a level and not a constant.
  twin   none | exact | two | namediff | armtwin | late
                                -- 0, 1 and 2 exact layout twins; a same-arity
                                   DIFFERENT-name twin; a twin that is itself a union
                                   ARM; a twin declared AFTER the functions that use it.
  route  fn | gen | std | eq    -- direct, through a hand-written generic, through
                                   `std:array`'s `mapIndexed`, or through a GENERIC `==`.
                                   `eq` is D75's route and it is the coordinate the D52
                                   and D57 grids never varied.
  src    objlit | annlocal | global | param | capture | call
                                -- the STORAGE CLASS of the cell the value lives in.
  dst    ret | gstore | pass | bind | lstore | mapval | listelem | arg
                                -- the DESTINATION the value is delivered to.

`eq` is representable only at `dst=arg` (a generic `==` consumes two arguments and yields
a boolean, so there is no other destination to vary), and `arg` needs a generic to be an
argument TO, so `route=fn`/`std` skip it.  `src=param` cannot ride `mapIndexed`, whose
callback arity is fixed.  Skips are counted and printed, never silently dropped.
"""
import itertools
import os
import sys

DECLS = ["arm", "arm2", "plain", "nounion"]
TWINS = ["none", "exact", "two", "namediff", "armtwin", "late"]
ROUTES = ["fn", "gen", "std", "eq"]
SRCS = ["objlit", "annlocal", "global", "param", "capture", "call"]
DSTS = ["ret", "gstore", "pass", "bind", "lstore", "mapval", "listelem", "arg"]


def base_decls(decl):
    if decl == "plain":
        return ["type Circle = { r: i32 }"]
    if decl == "nounion":
        return [
            "type Circle = { r: i32 }",
            "type Sq = { s: i32 }",
            "type Tri = { t: i32 }",
            "type Other = Sq | Tri",
        ]
    if decl == "arm":
        return [
            "type Circle = { r: i32 }",
            "type Sq = { s: i32 }",
            "type Shape = Circle | Sq",
        ]
    # arm2 -- the same struct is an arm of TWO declared unions.
    return [
        "type Circle = { r: i32 }",
        "type Sq = { s: i32 }",
        "type Shape = Circle | Sq",
        "type Tri = { t: i32 }",
        "type Shape2 = Circle | Tri",
    ]


def twin_decls(twin):
    """(declared with the prelude block, declared AFTER the functions)."""
    if twin == "none":
        return [], []
    if twin == "exact":
        return ["type Dot = { r: i32 }"], []
    if twin == "two":
        return ["type Dot = { r: i32 }", "type Dot2 = { r: i32 }"], []
    if twin == "namediff":
        return ["type Dot = { q: i32 }"], []
    if twin == "armtwin":
        return [
            "type Dot = { r: i32 }",
            "type Ring2 = { g: i32 }",
            "type Other2 = Dot | Ring2",
        ], []
    if twin == "late":
        return [], ["type Dot = { r: i32 }"]
    raise AssertionError(twin)


def skipped(decl, twin, route, src, dst):
    if route == "eq" and dst != "arg":
        return "a generic == has no destination to vary"
    if dst == "arg" and route in ("fn", "std"):
        return "arg needs a generic to be an argument to"
    if route == "std" and src == "param":
        return "mapIndexed's callback arity is fixed"
    return None


def emit(decl, twin, route, src, dst):
    block = base_decls(decl)
    tw_block, tw_late = twin_decls(twin)
    block = block + tw_block

    imports = []
    helpers = []
    globals_ = []

    if route in ("gen", "eq"):
        helpers.append("function idg<T>(x: T): T { return x }")
    if route == "eq":
        helpers.append("function eqT<T>(x: T, y: T) { return x == y }")
    if route == "std":
        imports.append('import { mapIndexed } from "std:array"')

    # ---- the source cell -------------------------------------------------------
    # `pre` are statements inside `mk` that establish the value; `val` names it.
    pre = []
    extra_param = ""
    if src == "objlit":
        pre.append("  const c = { r: n }")
        val = "c"
        val2 = "c"
    elif src == "annlocal":
        pre.append("  const c: Circle = { r: n }")
        val = "c"
        val2 = "c"
    elif src == "global":
        globals_.append("const gsrc: Circle = { r: 7 }")
        globals_.append("const gsrc2: Circle = { r: 7 }")
        val = "gsrc"
        val2 = "gsrc2"
    elif src == "param":
        extra_param = ", c: Circle"
        val = "c"
        val2 = "c"
    elif src == "capture":
        pre.append("  const c: Circle = { r: n }")
        val = "c"
        val2 = "c"
    else:  # call
        helpers.append("function thru(x: Circle) { return x }")
        pre.append("  const c0: Circle = { r: n }")
        val = "thru(c0)"
        val2 = "thru(c0)"

    # ---- the transport ---------------------------------------------------------
    def T(e):
        if route == "gen":
            return "idg(" + e + ")"
        return e

    # ---- the destination -------------------------------------------------------
    # `body` are the statements after `pre`; `retexpr` is what `mk` returns;
    # `mkret_is_arm` says the caller must read `.r` off the call.
    body = []
    mkret_is_arm = False
    tail = []

    if dst == "ret":
        retexpr = T(val)
        mkret_is_arm = True
    elif dst == "gstore":
        globals_.append("let gsto: Circle = { r: 0 }")
        body.append("  gsto = " + T(val))
        retexpr = "n"
    elif dst == "pass":
        helpers.append("function sink(x: Circle): i32 { return x.r }")
        retexpr = "sink(" + T(val) + ")"
    elif dst == "bind":
        body.append("  const o: Circle = " + T(val))
        retexpr = "o.r"
    elif dst == "lstore":
        body.append("  let o: Circle = { r: 0 }")
        body.append("  o = " + T(val))
        retexpr = "o.r"
    elif dst == "mapval":
        body.append("  const m: {[string]: Circle} = Map()")
        body.append('  m["k"] = ' + T(val))
        retexpr = '(m["k"] ?? { r: 0 }).r'
    elif dst == "listelem":
        body.append("  const xs: Circle[] = [" + T(val) + "]")
        retexpr = "xs[0].r"
    else:  # arg
        if route == "eq":
            body.append("  const eqr = eqT(" + val + ", " + val2 + ")")
            body.append("  if !eqr { return 0 }")
            retexpr = "n"
        else:  # gen
            retexpr = "idg(" + val + ").r"

    # ---- capture wraps the DELIVERY in a nested function ------------------------
    if src == "capture":
        # A nested function cannot hand the ARM back through an `i32` result, so the
        # capture x ret pair delivers through the ENCLOSING return instead; the capture
        # is still the storage class the value is read from, and the cell is counted.
        if not mkret_is_arm:
            inner = ["  function inner(): i32 {"]
            for b in body:
                inner.append("  " + b)
            inner.append("    return " + retexpr)
            inner.append("  }")
            body = inner
            retexpr = "inner()"

    stmts = pre + body

    # ---- the producer ----------------------------------------------------------
    if route == "std":
        params = "n: i32, _i: i32"
    else:
        params = "n: i32" + extra_param
    fn = ["function mk(" + params + ") {"] + stmts + ["  return " + retexpr, "}"]

    # ---- the driver ------------------------------------------------------------
    if route == "std":
        call = "mapIndexed([7], mk)[0]"
    elif src == "param":
        call = "mk(7, pc)"
    else:
        call = "mk(7)"

    read = call + ".r" if mkret_is_arm else call
    if dst == "gstore":
        drv = [call, "print(gsto.r)"]
    else:
        drv = ["print(" + read + ")"]

    if src == "param":
        drive = ["function drive() {", "  const pc: Circle = { r: 7 }"]
        for d in drv:
            drive.append("  " + d)
        drive.append("  return 0")
        drive.append("}")
        tail = drive + ["drive()"]
    else:
        tail = drv

    out = []
    out += imports
    out += block
    out += globals_
    out += helpers
    out += fn
    out += tw_late
    out += tail
    return "\n".join(out) + "\n"


def main():
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.endswith(".vl") or f == "manifest.tsv":
            os.remove(os.path.join(outdir, f))
    n = 0
    nskip = 0
    skipwhy = {}
    manifest = []
    for decl, twin, route, src, dst in itertools.product(
        DECLS, TWINS, ROUTES, SRCS, DSTS
    ):
        why = skipped(decl, twin, route, src, dst)
        if why:
            nskip += 1
            skipwhy[why] = skipwhy.get(why, 0) + 1
            continue
        name = "_".join([decl, twin, route, src, dst])
        src_text = emit(decl, twin, route, src, dst)
        with open(os.path.join(outdir, name + ".vl"), "w") as fh:
            fh.write(src_text)
        # THE EXPECTATION IS COMPUTED HERE, from the program this generator just wrote.
        manifest.append(name + "\t7")
        n += 1
    with open(os.path.join(outdir, "manifest.tsv"), "w") as fh:
        fh.write("\n".join(manifest) + "\n")
    print("cells=%d skipped=%d" % (n, nskip))
    for k, v in sorted(skipwhy.items()):
        print("  skip %5d  %s" % (v, k))


if __name__ == "__main__":
    main()
