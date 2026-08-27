#!/usr/bin/env python3
"""
The D93 / D94 grid generator — the CLAIMANT-PAIR grid.

D93 and D94 are both "two claimants collapse onto one slot".  Neither can be seen by a
grid that puts ONE unit in a program, and D93's own row says so: pairing is the trigger
and a single unit runs.  So `pairing` is axis one here, and every other axis is crossed
against it.

  pairing  0 | 1 | 2      -- the number of EXTRA claimant units beyond the first.
                             0 = unit A alone (leaf `Circle`, a union ARM).
                             1 = A + B (B's leaf is the TWIN).
                             2 = A + B + C (C's leaf is a SECOND exact twin `Dot2`).
                             pairing 0 is the control the refuted floors reddened.
  container nestedmap | mapval | structfield | listelem | listoflist
                          -- where the leaf type sits.  D93 is `nestedmap`, D94 is
                             `structfield`; the other three are the containers D47/D48/
                             D49/D63/D64 closed, kept as the backward-move detector.
  twin     none | exact | namediff | armtwin
                          -- what unit B's leaf IS.  `none` reuses `Circle` (so the two
                             units are genuinely the same type and MUST share a slot),
                             `exact` a layout twin `type Dot = {r:i32}`, `namediff` a
                             same-arity DIFFERENT-field-name twin, `armtwin` a twin that
                             is itself an arm of a second union.
  spelling inline | alias | direct | inferred
                          -- the INTERN STATE of the container type.
                             alias    : `type CA = <shape>` declared, binding annotated
                                        with the alias.
                             inline   : the alias is declared too (so the row exists) but
                                        the binding is annotated with the inline shape.
                             direct   : NO alias declared, binding annotated inline.
                             inferred : the alias is declared, the binding carries NO
                                        annotation.  For the two MAP containers a bare
                                        `Map()` does not type, so `inferred` there binds
                                        the un-annotated result of a helper whose RETURN
                                        type is the alias.
  order    a | b          -- declaration/statement order of the units.

Every cell prints one line per unit: `7`, `9`, `11`.  The expectation is computed by the
GENERATOR from the program's own semantics, never from the compiler, so a module that
loads and answers wrong grades `wrong_value` and not `runs`.

Cells that are structurally unrepresentable are SKIPPED, counted and printed.
"""
import itertools
import os
import sys

PAIRINGS = [0, 1, 2]
CONTAINERS = ["nestedmap", "mapval", "structfield", "listelem", "listoflist"]
TWINS = ["none", "exact", "namediff", "armtwin"]
SPELLINGS = ["inline", "alias", "direct", "inferred"]
ORDERS = ["a", "b"]

# The three units: (suffix, leaf-type slot, printed value).
UNITS = [("A", 0, 7), ("B", 1, 9), ("C", 2, 11)]


def leaf_field(twin, slot):
    """The FIELD NAME the unit's leaf struct carries.  Only `namediff` differs."""
    if slot == 1 and twin == "namediff":
        return "q"
    return "r"


def leaf_name(twin, slot):
    if slot == 0:
        return "Circle"
    if slot == 1:
        return "Circle" if twin == "none" else "Dot"
    return "Circle" if twin == "none" else "Dot2"


def prelude(pairing, twin):
    """The type declarations every cell opens with."""
    out = [
        "type Circle = { r: i32 }",
        "type Sq = { s: i32 }",
        "type Shape = Circle | Sq",
    ]
    if pairing >= 1 and twin != "none":
        if twin == "namediff":
            out.append("type Dot = { q: i32 }")
        else:
            out.append("type Dot = { r: i32 }")
        if twin == "armtwin":
            out.append("type Ring = { g: i32 }")
            out.append("type Other = Dot | Ring")
    if pairing >= 2 and twin != "none":
        # `Dot2` is ALWAYS the exact layout twin, at every `twin` level: the third
        # claimant's job is to be a third claimant, and under `namediff` it is what
        # keeps a genuine collision in the program while unit B stands apart.
        out.append("type Dot2 = { r: i32 }")
        if twin == "armtwin":
            out.append("type Ring2 = { g: i32 }")
            out.append("type Other2 = Dot2 | Ring2")
    return out


def shape_of(container, leaf):
    """The container's own type SHAPE, spelled inline."""
    if container == "nestedmap":
        return "{[string]: {[string]: %s}}" % leaf
    if container == "mapval":
        return "{[string]: %s}" % leaf
    if container == "structfield":
        return "{ xs: %s[] }" % leaf
    if container == "listelem":
        return "%s[]" % leaf
    if container == "listoflist":
        return "%s[][]" % leaf
    raise AssertionError(container)


def inner_shape_of(container, leaf):
    """The nested-map container's INNER map type, spelled inline (else None)."""
    if container == "nestedmap":
        return "{[string]: %s}" % leaf
    return None


def alias_decls(container, leaf, suffix):
    """(alias declarations, outer alias name, inner alias name-or-None)."""
    outer = "CT%s" % suffix
    inner = None
    decls = []
    if container == "nestedmap":
        inner = "IN%s" % suffix
        decls.append("type %s = {[string]: %s}" % (inner, leaf))
        decls.append("type %s = {[string]: %s}" % (outer, inner))
    else:
        decls.append("type %s = %s" % (outer, shape_of(container, leaf)))
    return decls, outer, inner


def unit_body(container, leaf, field, suffix, val, spelling, outer, inner):
    """The statements for one unit.  Returns a list of source lines."""
    L = []
    # The annotation TEXT the outer binding carries, and the inner one where there is one.
    if spelling == "alias":
        outer_ann = ": %s" % outer
        inner_ann = ": %s" % inner if inner else None
    elif spelling in ("inline", "direct"):
        outer_ann = ": %s" % shape_of(container, leaf)
        inner_ann = (": %s" % inner_shape_of(container, leaf)) if inner else None
    else:  # inferred
        outer_ann = ""
        inner_ann = ": %s" % inner if inner else None

    c = "c%s" % suffix
    L.append("const %s: %s = { %s: %d }" % (c, leaf, field, val))

    if container == "mapval":
        m = "m%s" % suffix
        if spelling == "inferred":
            L.append("const %s = mk%s()" % (m, suffix))
        else:
            L.append("const %s%s = Map()" % (m, outer_ann))
            L.append('%s["k"] = %s' % (m, c))
        g = "g%s" % suffix
        L.append('const %s = %s["k"]' % (g, m))
        L.append("if %s != null { v%s = %s.%s }" % (g, suffix, g, field))
        return L

    if container == "nestedmap":
        im = "im%s" % suffix
        nm = "nm%s" % suffix
        if spelling == "inferred":
            L.append("const %s = mk%s()" % (nm, suffix))
        else:
            L.append("const %s%s = Map()" % (im, inner_ann))
            L.append('%s["k"] = %s' % (im, c))
            L.append("const %s%s = Map()" % (nm, outer_ann))
            L.append('%s["a"] = %s' % (nm, im))
        q = "q%s" % suffix
        g = "g%s" % suffix
        L.append('const %s = %s["a"]' % (q, nm))
        L.append("if %s != null {" % q)
        L.append('  const %s = %s["k"]' % (g, q))
        L.append("  if %s != null { v%s = %s.%s }" % (g, suffix, g, field))
        L.append("}")
        return L

    if container == "structfield":
        xs = "xs%s" % suffix
        b = "b%s" % suffix
        L.append("const %s: %s[] = [%s]" % (xs, leaf, c))
        L.append("const %s%s = { xs: %s }" % (b, outer_ann, xs))
        L.append("v%s = %s.xs[0].%s" % (suffix, b, field))
        return L

    if container == "listelem":
        xs = "xs%s" % suffix
        L.append("const %s%s = [%s]" % (xs, outer_ann, c))
        L.append("v%s = %s[0].%s" % (suffix, xs, field))
        return L

    if container == "listoflist":
        inl = "in%s" % suffix
        out = "out%s" % suffix
        L.append("const %s: %s[] = [%s]" % (inl, leaf, c))
        L.append("const %s%s = [%s]" % (out, outer_ann, inl))
        L.append("v%s = %s[0][0].%s" % (suffix, out, field))
        return L

    raise AssertionError(container)


def maker_fn(container, leaf, field, suffix, val, outer, inner):
    """The `inferred` spelling's helper for the two MAP containers."""
    L = ["function mk%s(): %s {" % (suffix, outer)]
    L.append("  const c: %s = { %s: %d }" % (leaf, field, val))
    if container == "mapval":
        L.append("  const m: %s = Map()" % outer)
        L.append('  m["k"] = c')
        L.append("  return m")
    else:
        L.append("  const im: %s = Map()" % inner)
        L.append('  im["k"] = c')
        L.append("  const nm: %s = Map()" % outer)
        L.append('  nm["a"] = im')
        L.append("  return nm")
    L.append("}")
    return L


def skipped(pairing, container, twin, spelling, order):
    if pairing == 0 and twin != "none":
        # With one unit there is no second claimant, so the twin level is not a level:
        # it would generate the SAME program four times.  Kept only at `none`.
        return "pairing=0 has no second claimant for the twin axis to vary"
    if pairing == 0 and order == "b":
        return "one unit has one order"
    if pairing == 2 and twin == "none":
        # C's leaf would be `Circle` too -- a third copy of unit A, not a third claimant.
        return "pairing=2 needs a declared twin family for the third claimant"
    return None


def emit(pairing, container, twin, spelling, order):
    units = UNITS[: pairing + 1]
    lines = list(prelude(pairing, twin))

    decls_by_unit = {}
    for suffix, slot, _val in units:
        leaf = leaf_name(twin, slot)
        decls, outer, inner = alias_decls(container, leaf, suffix)
        decls_by_unit[suffix] = (decls, outer, inner, leaf)

    ordered = list(units)
    if order == "b":
        ordered = list(reversed(units))

    # `direct` declares NO alias at all -- every type is spelled inline at its binding.
    # Every other spelling declares the alias row, and they differ in whether the
    # binding NAMES it (`alias`), spells the shape beside it (`inline`), or carries no
    # annotation at all (`inferred`).
    if spelling != "direct":
        for suffix, _slot, _val in ordered:
            lines.extend(decls_by_unit[suffix][0])

    # The `inferred` makers for the two MAP containers: a bare `Map()` does not type
    # without an annotation, so the un-annotated binding takes a declared RETURN instead.
    if spelling == "inferred" and container in ("nestedmap", "mapval"):
        for suffix, slot, val in ordered:
            _d, outer, inner, leaf = decls_by_unit[suffix]
            lines.extend(
                maker_fn(container, leaf, leaf_field(twin, slot), suffix, val,
                         outer, inner)
            )

    lines.append("function reader() {")
    # ONE printed line per cell (the D52/D87 grader's contract): each unit's READ lands
    # in its own accumulator and the units are combined by place value, so a single unit
    # answering wrong is still visible in the one line and grades `wrong_value`.
    for suffix, _slot, _val in units:
        lines.append("  let v%s = -1" % suffix)
    for suffix, slot, val in ordered:
        _d, outer, inner, leaf = decls_by_unit[suffix]
        body = unit_body(container, leaf, leaf_field(twin, slot), suffix, val,
                         spelling, outer, inner)
        for b in body:
            lines.append("  " + b)
    terms = []
    scale = 1
    for suffix, _slot, _val in units:
        terms.append("v%s * %d" % (suffix, scale))
        scale = scale * 1000
    lines.append("  print(%s)" % " + ".join(terms))
    lines.append("}")
    lines.append("")
    lines.append("reader()")

    total = 0
    scale = 1
    for _s, _sl, v in units:
        total = total + v * scale
        scale = scale * 1000
    return "\n".join(lines) + "\n", str(total)


def main():
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    manifest = []
    skips = {}
    for pairing, container, twin, spelling, order in itertools.product(
        PAIRINGS, CONTAINERS, TWINS, SPELLINGS, ORDERS
    ):
        why = skipped(pairing, container, twin, spelling, order)
        if why:
            skips[why] = skips.get(why, 0) + 1
            continue
        name = "p%d_%s_%s_%s_%s" % (pairing, container, twin, spelling, order)
        src, expect = emit(pairing, container, twin, spelling, order)
        with open(os.path.join(outdir, name + ".vl"), "w") as fh:
            fh.write(src)
        manifest.append((name, expect))
    with open(os.path.join(outdir, "manifest.tsv"), "w") as fh:
        for name, expect in sorted(manifest):
            fh.write("%s\t%s\n" % (name, expect))
    print("cells=%d" % len(manifest))
    total_skips = sum(skips.values())
    print("skipped=%d" % total_skips)
    for why in sorted(skips):
        print("  %-70s %d" % (why, skips[why]))


if __name__ == "__main__":
    main()
