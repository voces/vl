#!/usr/bin/env python3
"""THE TWO-DESTINATION GRID (D411) — one un-annotated list literal, TWO declared
destinations, and the axis is which SPELLING each destination uses.

    python3 gen411.py <outdir>            # write the cells
    python3 gen411.py --verify <outdir>   # regenerate and assert byte-identity

WHY IT HAD TO BE BUILT. D411's row records that no census block reaches this class:
blocks B/C/D/E all carry AT MOST ONE annotated destination per binding, so the
coordinate "two destinations that disagree" does not exist anywhere in the 250,238
cells. A derived corpus cannot collapse a class its population never contained, which
is why the cells this grid names go into `distilled/named/` whole rather than through
`redistil.py`.

THE AXES.

  `d2` — the destination whose element is a union BOX (`Shape[]`, kind 2). This is the
     one `letRefListDestSlot` (D381) can see: its `letAnnDestBoxListSlot` gate returns
     -1 for every other kind, so the rung silently steps past a kind-1 destination and
     mints the literal at the box.

  `d1` — the destination whose element is a plain STRUCT row (`Circle[]`, kind 1). It
     is invisible to that rung by construction. `none` is the CONTROL: with no second
     destination the program is D381's own subject and RUNS, so a candidate that
     reddens the control has broken the row it is standing on.

  `order` — which of the two appears first in the source. `letRefListDestSlot` is an
     ascending-arena-index first-match scan, so if the answer moved with `order` the
     rung would be reading a tie-break rather than a kind filter. It does not, and the
     grid says so rather than asserting it.

Seven spellings per destination, one per way the language writes "this list flows
there" — the same seven `letRefListDestSlot` enumerates, so a form it handles in the
kind-2 position is a form this grid also asks about in the kind-1 position:

    bind        const c: E[] = lv1
    listlist    const c: E[][] = [lv1]
    mapstore    m["k"] = lv1        over a declared {[string]: E[]}
    callarg     take(lv1)           into take(p: E[])
    ret         return lv1          from (): E[]
    structfield const w: W = { xs: lv1 }   over type W = { xs: E[] }
    assign      a = lv1             into a declared `let a: E[]`

EVERY CELL PRINTS `7` WHEN IT WORKS, and every cell reads the element back through the
kind-1 spelling where it has one — a cell that only constructs would grade `runs` while
the store that mismatches was never reached, which is a probe measuring nothing.
`ret` can appear at most once in a program (it fixes the enclosing function's return
annotation), so the `ret`/`ret` pair is skipped; and with `d1=none` the `order` axis is
degenerate, so those seven cells appear once each. 7 x 8 x 2 = 112 minus 2 (`ret`/`ret`)
minus 7 (the degenerate control order) = **103**.
"""
import os
import sys

FORMS = ["bind", "listlist", "mapstore", "callarg", "ret", "structfield", "assign"]
D1FORMS = FORMS + ["none"]
ORDERS = ["u_first", "s_first"]


def top(form, tag, elem):
    """Top-level declarations a form needs (helper fn / struct / map type)."""
    if form == "callarg":
        return ["function take%s(p: %s[]) { print(p.length) }" % (tag, elem)]
    if form == "structfield":
        return ["type W%s = { xs: %s[] }" % (tag, elem)]
    return []


def stmts(form, tag, elem):
    """The destination statements, inside the function body, after `lv1`."""
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
        return [
            "let a%s: %s[] = []" % (tag, elem),
            "a%s = lv1" % tag,
        ]
    raise AssertionError(form)


def read_back(form, tag, union):
    """Read the element back through THIS destination, so the store is actually reached.

    A cell that only BUILDS the destination grades `runs` on a compiler that never
    emitted the mismatching store at all — the probe would be distinguishing nothing.

    The two sides read differently and they have to: `Shape` is `Circle | Sq` and has
    no common field, so the union side reads `.length` (a wrapper read that still
    forces the local's cell type) while the kind-1 side reads `[0].r` (which forces
    the element heap as well). Making both read `.r` is a LOUD CHECK REJECT on every
    cell — the grid would grade 103 cells and distinguish nothing.
    """
    if form == "bind":
        v = "c%s" % tag
    elif form == "listlist":
        v = "c%s[0]" % tag
        return [
            "if c%s.length > 0 { %s } else { print(0) }"
            % (tag, ("if (c%s[0]).length > 0 { print((c%s[0])[0].r) } else { print(0) }" % (tag, tag)) if not union else ("print((c%s[0]).length)" % tag))
        ]
    elif form == "mapstore":
        return [
            'const g%s = m%s["k"] ?? []' % (tag, tag),
            "if g%s.length > 0 { %s } else { print(0) }"
            % (tag, ("print(g%s[0].r)" % tag) if not union else ("print(g%s.length)" % tag)),
        ]
    elif form == "callarg":
        return []  # the callee prints its own length
    elif form == "ret":
        return []  # the caller prints
    elif form == "structfield":
        return [
            "if (w%s.xs).length > 0 { %s } else { print(0) }"
            % (tag, ("print((w%s.xs)[0].r)" % tag) if not union else ("print((w%s.xs).length)" % tag))
        ]
    elif form == "assign":
        v = "a%s" % tag
    else:
        raise AssertionError(form)
    return [
        "if %s.length > 0 { %s } else { print(0) }"
        % (v, ("print(%s[0].r)" % v) if not union else ("print(%s.length)" % v))
    ]


def expect(d2, d1, order):
    """The cell's expected stdout, COMPUTED HERE and never read off a compiler.

    Print order is the source order: a `callarg` destination prints inside the callee at
    the point of the call (so it lands with the destination statements, before either
    read-back), the union read-back prints the list LENGTH (`Shape` has no common field),
    the kind-1 read-back prints the payload `7`, and a `ret` destination prints
    `rr.length` last, after `f()` has returned.

    Every cell of this grid is check-clean INVALID WASM or a loud reject on the base, so
    nothing here has ever been observed — which is exactly why it is derived rather than
    recorded. If a cell starts running, this is what says whether it runs CORRECTLY.
    """
    out = []
    # The DESTINATION statements run in `order`; only `callarg` prints from there.
    seq = [d2] + ([d1] if d1 != "none" else [])
    if order == "s_first":
        seq.reverse()
    for form in seq:
        if form == "callarg":
            out.append("1")
    # The read-backs are emitted d2-then-d1 whatever `order` says — `order` moves the
    # destinations, not the reads, which is what keeps it a clean axis.
    for form, union in [(d2, True)] + ([(d1, False)] if d1 != "none" else []):
        if form in ("callarg", "ret"):
            continue
        out.append("1" if union else "7")
    if "ret" in (d2, d1):
        out.append("1")
    return "\n".join(out)


def cell(d2, d1, order):
    tops = [
        "type Circle = { r: i32 }",
        "type Sq = { s: i32 }",
        "type Shape = Circle | Sq",
    ]
    tops += top(d2, "U", "Shape")
    if d1 != "none":
        tops += top(d1, "S", "Circle")

    body = ["const lv1 = [{ r: 7 }]"]
    a = stmts(d2, "U", "Shape")
    b = stmts(d1, "S", "Circle") if d1 != "none" else []
    body += (a + b) if order == "u_first" else (b + a)
    body += read_back(d2, "U", True)
    if d1 != "none":
        body += read_back(d1, "S", False)

    ret_ann = ""
    if d2 == "ret":
        ret_ann = ": Shape[]"
        body += ["return lv1"]
    elif d1 == "ret":
        ret_ann = ": Circle[]"
        body += ["return lv1"]

    out = list(tops)
    out.append("function f()%s {" % ret_ann)
    out += ["  " + s for s in body]
    out.append("}")
    if ret_ann:
        out.append("const rr = f()")
        out.append("print(rr.length)")
    else:
        out.append("f()")
    return "\n".join(out) + "\n"


def cells():
    for d2 in FORMS:
        for d1 in D1FORMS:
            if d2 == "ret" and d1 == "ret":
                continue  # one return annotation per function
            for order in ORDERS:
                if d1 == "none" and order == "s_first":
                    continue  # no second destination: the order axis is degenerate
                yield ("d411_%s__%s__%s.vl" % (d2, d1, order)), cell(d2, d1, order)


# THE 40 CELLS THAT LIVE IN `distilled/named/`, and why it is not all 103. `CLAUDE.md`'s
# rule is that a grid names a SET, not that the whole grid is committed. What has to be kept
# whole is the boundary: the 7 single-destination CONTROLS (the price any checker-side answer
# pays — every variance or storage-class rule that reddens this class reddens them, and they
# are D381's own subject) and the 28 cells the landing does NOT move (D501's population,
# bounded by `reach=0` rather than by the predicate). Five witnesses from the 68 the landing
# DOES move are added so the set carries the gain and not only its edges.
RESIDUE = (
    [("assign", "ret"), ("bind", "ret"), ("callarg", "ret"), ("listlist", "ret")]
    + [("mapstore", d) for d in ("assign", "bind", "callarg", "listlist", "ret")]
    + [("structfield", d) for d in ("assign", "bind", "callarg", "listlist", "ret")]
)
WITNESSES = ["bind", "listlist", "callarg", "ret", "assign"]


def named_subset():
    """The exact file names committed under `distilled/named/`."""
    out = ["d411_%s__none__u_first.vl" % d2 for d2 in FORMS]
    for d2, d1 in RESIDUE:
        for order in ORDERS:
            out.append("d411_%s__%s__%s.vl" % (d2, d1, order))
    out += ["d411_%s__bind__u_first.vl" % w for w in WITNESSES]
    return sorted(set(out))


def main():
    verify = "--verify" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    here = os.path.dirname(os.path.abspath(__file__))
    default = os.path.join(here, "..", "distilled", "named") if verify else os.path.join(here, "cells")
    outdir = args[0] if args else os.path.abspath(default)
    src = dict(cells())
    if verify:
        # BYTE-IDENTITY against the committed set. A generator that has drifted from the
        # cells the gate carries is a generator that documents a different measurement than
        # the one that was taken, which is the failure this flag exists to catch.
        want = named_subset()
        bad = 0
        for name in want:
            p = os.path.join(outdir, name)
            if not os.path.exists(p):
                print("MISSING  %s" % name)
                bad += 1
            elif open(p).read() != src[name]:
                print("DIFFERS  %s" % name)
                bad += 1
        print("%d named cells checked against %s" % (len(want), outdir))
        if bad:
            print("VERIFY FAILED: %d of %d differ from the generator" % (bad, len(want)))
            return 1
        print("verify OK: every named cell is byte-identical to the generator")
        return 0
    os.makedirs(outdir, exist_ok=True)
    for name, text in src.items():
        with open(os.path.join(outdir, name), "w") as fh:
            fh.write(text)
    print("%d cells written -> %s" % (len(src), outdir))
    return 0


if __name__ == "__main__":
    sys.exit(main())
