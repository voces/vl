#!/usr/bin/env python3
"""THE SCOPE AXIS THE D411 GRID NEVER HAD (D661).

    python3 gen661.py <outdir>            # write the cells
    python3 gen661.py --verify <outdir>   # regenerate and assert byte-identity

WHY IT HAD TO BE BUILT. D411's grid varies the SPELLING of each of two destinations and
holds one thing fixed in every one of its 103 cells: both destinations bind the SAME
`lv1`. So the grid — and the 33 corpus cells distilled from it — can only ever answer
"what does the compiler do with a genuinely two-destination binding". It cannot see the
question this grid asks, which is whether the rung that refuses those 33 also refuses
programs where each binding has exactly ONE destination.

It does. `letRefListDestSlotK`'s destination scan is `while i < P.nodes.length` over the
WHOLE arena, matched on the binding's NAME — its header says so — so two bindings that
merely SHARE A NAME in different scopes are read as one binding with two destinations.
Renaming one of them is the only edit needed to make such a program run.

THE AXES.

  `scope` — WHERE the second destination's binding lives.

    same    both destinations bind the one `lv1` (D411's shape). GENUINELY ambiguous:
            a list value has one element storage and the two destinations demand two.
            These must stay REFUSED; a candidate that runs them has broken the ruling.
    sibfn   two SIBLING functions, one `const lv1` each, one destination each. Every
            binding here is single-destination and every cell must RUN.
    shadow  a module-level `lv1` with the union destination and a function-local `lv1`
            that SHADOWS it with the struct destination. Single-destination each; the
            local's own scope is the only place its name resolves. Must RUN.
    cap     the destination is inside a NESTED function that CAPTURES `lv1`. One binding,
            one destination, and it is the case a scoped walk loses if it refuses to
            enter a nested function at all — it RUNS on the base and must keep running.
    capsh   an outer `lv1` with the struct destination and a nested function declaring its
            OWN `lv1` with the union one. The nested frame REBINDS the name, so its uses
            never denote the outer binding. Must RUN.
    capp    the same, with the nested frame rebinding through a PARAMETER rather than a
            local — the second of the two binding forms a function introduces, and the
            one a `parentLetOf`-only shadow test cannot see. Must RUN.

  `d2` / `d1` — the seven destination spellings, exactly `gen411.py`'s, so a form that
     grid asks in the kind-2 position this grid asks in both positions and in every
     scope. `ret` needs an enclosing function, so it is skipped at module scope.

  `order` — which of the two functions (or, for `shadow`, which of the two `lv1`s) is
     DECLARED first. The scan is an ascending-arena first-match, so if the answer moved
     with `order` the rung would be reading a tie-break.

EVERY CELL PRINTS `7` FOR A STRUCT-SIDE READ AND `1` FOR A UNION-SIDE READ, computed
here and never read off a compiler, exactly as `gen411.py` does. Each destination is read
BACK through its own spelling: a cell that only constructs would grade `runs` on a
compiler that never emitted the mismatching store.
"""
import os
import sys

FORMS = ["bind", "listlist", "mapstore", "callarg", "ret", "structfield", "assign"]
MODULE_FORMS = [f for f in FORMS if f != "ret"]  # a `return` needs an enclosing function
ORDERS = ["u_first", "s_first"]
SCOPES = ["sibfn", "shadow"]


def top(form, tag, elem):
    """Top-level declarations a form needs (helper fn / struct type)."""
    if form == "callarg":
        return ["function take%s(p: %s[]) { print(p.length) }" % (tag, elem)]
    if form == "structfield":
        return ["type W%s = { xs: %s[] }" % (tag, elem)]
    return []


def stmts(form, tag, elem):
    """The destination statements, after the `lv1` they consume."""
    if form == "bind":
        return ["const c%s: %s[] = lv1" % (tag, elem)]
    if form == "listlist":
        return ["const c%s: %s[][] = [lv1]" % (tag, elem)]
    if form == "mapstore":
        return [
            "const m%s: {[string]: %s[]} = Map()" % (tag, elem),
            'm%s["k"] = lv1' % tag,
        ]
    if form == "callarg":
        return ["take%s(lv1)" % tag]
    if form == "ret":
        return []  # the `return` is emitted last, by the caller
    if form == "structfield":
        return ["const w%s: W%s = { xs: lv1 }" % (tag, tag)]
    if form == "assign":
        return ["let a%s: %s[] = []" % (tag, elem), "a%s = lv1" % tag]
    raise AssertionError(form)


def read_back(form, tag, union):
    """Read the element back through THIS destination, so the store is reached.

    The two sides read differently and they have to: `Shape` is `Circle | Sq` and has no
    common field, so the union side reads `.length` (which still forces the local's cell
    type) while the kind-1 side reads `[0].r` (which forces the element heap as well).
    """
    if form == "listlist":
        inner = ("print((c%s[0]).length)" % tag) if union else (
            "if (c%s[0]).length > 0 { print((c%s[0])[0].r) } else { print(0) }" % (tag, tag))
        return ["if c%s.length > 0 { %s } else { print(0) }" % (tag, inner)]
    if form == "mapstore":
        return [
            'const g%s = m%s["k"] ?? []' % (tag, tag),
            "if g%s.length > 0 { %s } else { print(0) }"
            % (tag, ("print(g%s.length)" % tag) if union else ("print(g%s[0].r)" % tag)),
        ]
    if form == "callarg":
        return []  # the callee prints its own length
    if form == "ret":
        return []  # the caller prints
    if form == "structfield":
        return [
            "if (w%s.xs).length > 0 { %s } else { print(0) }"
            % (tag, ("print((w%s.xs).length)" % tag) if union else ("print((w%s.xs)[0].r)" % tag))
        ]
    v = ("c%s" % tag) if form == "bind" else ("a%s" % tag)
    return [
        "if %s.length > 0 { %s } else { print(0) }"
        % (v, ("print(%s.length)" % v) if union else ("print(%s[0].r)" % v))
    ]


def side_lines(form, tag, elem, union):
    """The statements one single-destination side contributes, `lv1` excluded."""
    out = stmts(form, tag, elem) + read_back(form, tag, union)
    if form == "ret":
        out = out + ["return lv1"]
    return out


def side_prints(form, union):
    """What one side prints, in source order. `callarg` prints inside the callee at the
    point of the call — i.e. before its (absent) read-back; `ret` prints in the caller."""
    if form == "callarg":
        return ["1"]
    if form == "ret":
        return ["1"]
    return ["1" if union else "7"]


def fn_block(name, form, tag, elem, union):
    """A whole single-destination function: its `lv1`, its destination, its read-back."""
    ann = (": %s[]" % elem) if form == "ret" else ""
    body = ["const lv1 = [{ r: 7 }]"] + side_lines(form, tag, elem, union)
    return ["function %s()%s {" % (name, ann)] + ["  " + s for s in body] + ["}"]


def call_lines(name, form, tag):
    if form == "ret":
        return ["const rr%s = %s()" % (tag, name), "print(rr%s.length)" % tag]
    return ["%s()" % name]


def cell_sibfn(d2, d1, order):
    """Two sibling functions, one `const lv1` each, one destination each."""
    tops = ["type Circle = { r: i32 }", "type Sq = { s: i32 }", "type Shape = Circle | Sq"]
    tops += top(d2, "U", "Shape")
    tops += top(d1, "S", "Circle")
    fu = fn_block("fu", d2, "U", "Shape", True)
    fs = fn_block("fs", d1, "S", "Circle", False)
    cu = call_lines("fu", d2, "U")
    cs = call_lines("fs", d1, "S")
    if order == "u_first":
        out = tops + fu + fs + cu + cs
        want = side_prints(d2, True) + side_prints(d1, False)
    else:
        out = tops + fs + fu + cs + cu
        want = side_prints(d1, False) + side_prints(d2, True)
    return "\n".join(out) + "\n", "\n".join(want)


def cell_shadow(d2, d1, order):
    """A module-level `lv1` (union destination) and a function-local `lv1` that SHADOWS
    it (struct destination). Two bindings, one destination each."""
    tops = ["type Circle = { r: i32 }", "type Sq = { s: i32 }", "type Shape = Circle | Sq"]
    tops += top(d2, "U", "Shape")
    tops += top(d1, "S", "Circle")
    glob = ["const lv1 = [{ r: 7 }]"] + side_lines(d2, "U", "Shape", True)
    fs = fn_block("fs", d1, "S", "Circle", False)
    cs = call_lines("fs", d1, "S")
    if order == "u_first":
        out = tops + glob + fs + cs
        want = side_prints(d2, True) + side_prints(d1, False)
    else:
        out = tops + fs + glob + cs
        # The module-level destination still runs where it is WRITTEN, which is after
        # `fs`'s declaration but before its call.
        want = side_prints(d2, True) + side_prints(d1, False)
    return "\n".join(out) + "\n", "\n".join(want)


def cell_cap(d2):
    """The union destination inside a NESTED function that captures `lv1`."""
    tops = ["type Circle = { r: i32 }", "type Sq = { s: i32 }", "type Shape = Circle | Sq"]
    tops += top(d2, "U", "Shape")
    inner = ["function inner() {"] + \
        ["  " + s for s in side_lines(d2, "U", "Shape", True)] + ["}"]
    if d2 == "ret":
        # A `return` inside `inner` returns from INNER, so `inner` is the annotated one.
        inner = ["function inner(): Shape[] {"] + \
            ["  " + s for s in side_lines(d2, "U", "Shape", True)] + ["}"]
        body = ["const lv1 = [{ r: 7 }]"] + inner + ["const rrU = inner()", "print(rrU.length)"]
    else:
        body = ["const lv1 = [{ r: 7 }]"] + inner + ["inner()"]
    out = tops + ["function outer() {"] + ["  " + s for s in body] + ["}", "outer()"]
    return "\n".join(out) + "\n", "\n".join(side_prints(d2, True))


def cell_capsh(d2):
    """An outer `lv1` with the STRUCT destination and a nested `lv1` with the union one."""
    tops = ["type Circle = { r: i32 }", "type Sq = { s: i32 }", "type Shape = Circle | Sq"]
    tops += top(d2, "U", "Shape")
    inner_body = ["const lv1 = [{ r: 9 }]"] + side_lines(d2, "U", "Shape", True)
    if d2 == "ret":
        inner = ["function inner(): Shape[] {"] + ["  " + s for s in inner_body] + ["}"]
        call = ["const rrU = inner()", "print(rrU.length)"]
    else:
        inner = ["function inner() {"] + ["  " + s for s in inner_body] + ["}"]
        call = ["inner()"]
    body = ["const lv1 = [{ r: 7 }]", "const cS: Circle[] = lv1"] + inner + call + \
        ["if cS.length > 0 { print(cS[0].r) } else { print(0) }"]
    out = tops + ["function outer() {"] + ["  " + s for s in body] + ["}", "outer()"]
    return "\n".join(out) + "\n", "\n".join(side_prints(d2, True) + ["7"])


def cell_capp():
    """The nested frame rebinds `lv1` as a PARAMETER, not as a local."""
    out = [
        "type Circle = { r: i32 }",
        "type Sq = { s: i32 }",
        "type Shape = Circle | Sq",
        "function outer() {",
        "  const lv1 = [{ r: 7 }]",
        "  const cS: Circle[] = lv1",
        "  function inner(lv1: Shape[]) {",
        "    const cU: Shape[] = lv1",
        "    print(cU.length)",
        "  }",
        "  const seed: Shape[] = [{ r: 1 }]",
        "  inner(seed)",
        "  if cS.length > 0 { print(cS[0].r) } else { print(0) }",
        "}",
        "outer()",
    ]
    return "\n".join(out) + "\n", "1\n7"


def cell_ctl(form, union):
    """A single-destination CONTROL with no second binding of the name at all — the
    program each half of a `sibfn`/`shadow` cell is, standing alone."""
    tops = ["type Circle = { r: i32 }", "type Sq = { s: i32 }", "type Shape = Circle | Sq"]
    tag, elem = ("U", "Shape") if union else ("S", "Circle")
    tops += top(form, tag, elem)
    out = tops + fn_block("f0", form, tag, elem, union) + call_lines("f0", form, tag)
    return "\n".join(out) + "\n", "\n".join(side_prints(form, union))


def cells():
    for order in ORDERS:
        for d2 in FORMS:
            for d1 in FORMS:
                n, w = cell_sibfn(d2, d1, order)
                yield ("d661_sibfn_%s__%s__%s.vl" % (d2, d1, order)), n, w
        for d2 in MODULE_FORMS:
            for d1 in FORMS:
                n, w = cell_shadow(d2, d1, order)
                yield ("d661_shadow_%s__%s__%s.vl" % (d2, d1, order)), n, w
    for form in FORMS:
        for union in (True, False):
            n, w = cell_ctl(form, union)
            yield ("d661_ctl_%s__%s.vl" % (form, "u" if union else "s")), n, w
    for d2 in FORMS:
        n, w = cell_cap(d2)
        yield ("d661_cap_%s.vl" % d2), n, w
        n, w = cell_capsh(d2)
        yield ("d661_capsh_%s.vl" % d2), n, w
    n, w = cell_capp()
    yield "d661_capp_bind.vl", n, w


# THE CELLS COMMITTED UNDER `distilled/named/`. `CLAUDE.md`'s rule is that a grid names a
# SET, not that the whole grid ships. What has to be kept whole here is the BOUNDARY: the
# 14 single-destination controls (any candidate that reddens one has broken D381/D411's
# own subject) and one cell per (scope x d2) — the coordinate that decides whether the
# scan is scoped — with `d1=bind` fixed, plus every `d1=ret` cell, because the return form
# is the one destination the scan reads through `fnIx` rather than through the arena and
# so is the one place the two halves of the bug can disagree.
def named_subset():
    out = ["d661_ctl_%s__%s.vl" % (f, u) for f in FORMS for u in ("u", "s")]
    out += ["d661_cap_%s.vl" % f for f in FORMS]
    out += ["d661_capsh_%s.vl" % f for f in FORMS]
    out += ["d661_capp_bind.vl"]
    for order in ORDERS:
        out += ["d661_sibfn_%s__bind__%s.vl" % (d2, order) for d2 in FORMS]
        out += ["d661_shadow_%s__bind__%s.vl" % (d2, order) for d2 in MODULE_FORMS]
        out += ["d661_sibfn_%s__ret__%s.vl" % (d2, order) for d2 in FORMS]
        out += ["d661_shadow_%s__ret__%s.vl" % (d2, order) for d2 in MODULE_FORMS]
    return sorted(set(out))


def main():
    verify = "--verify" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    here = os.path.dirname(os.path.abspath(__file__))
    default = os.path.join(here, "..", "distilled", "named") if verify else os.path.join(here, "cells")
    outdir = args[0] if args else os.path.abspath(default)
    src = {n: (t, w) for n, t, w in cells()}
    if verify:
        want = named_subset()
        bad = 0
        for name in want:
            p = os.path.join(outdir, name)
            if not os.path.exists(p):
                print("MISSING  %s" % name)
                bad += 1
            elif open(p).read() != src[name][0]:
                print("DIFFERS  %s" % name)
                bad += 1
        print("%d named cells checked against %s" % (len(want), outdir))
        if bad:
            print("VERIFY FAILED: %d of %d differ from the generator" % (bad, len(want)))
            return 1
        print("verify OK: every named cell is byte-identical to the generator")
        return 0
    os.makedirs(outdir, exist_ok=True)
    for name, (text, want) in src.items():
        with open(os.path.join(outdir, name), "w") as fh:
            fh.write(text)
        with open(os.path.join(outdir, name[:-3] + ".want"), "w") as fh:
            fh.write(want + "\n")
    print("%d cells written -> %s" % (len(src), outdir))
    return 0


if __name__ == "__main__":
    sys.exit(main())
