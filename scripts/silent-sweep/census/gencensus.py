#!/usr/bin/env python3
"""THE CENSUS GRID — the cross product of the axes this programme's rows were each found on.

Every earlier grid in `scripts/silent-sweep/` was scoped to the row it was chasing, and each
was later shown to hold constant the axis that mattered.  This one crosses them.

AXES (each earned by a filed row)

  store      storage class of the binding the READ names
             local | global | param | callres | capture              (D139, D131)
  escope     the scope the READ statement executes in
             mod | fn | nested | lambda                              (gen.py's scope axis)
  declness   how the payload shape is spelled
             byname | anon | nodecl                                  (D112)
  twin       a same-layout declaration
             none | exact | samearity | armtwin | late               (D88/D100, D155)
  union      no union | declared and unused | declared and used      (D88, D139)
  claim      0 | 1 | 2 container aliases of the SAME layout          (D88's claimant count)
  cont       bare | list | listlist | list3 | mapval | nestedmap | map3 |
             forin | map_of_list | list_of_map | structfield | structfield2
  annpos     none | binding | dest | retann | readsite               (D155, D158)
  deliv      direct | boundlocal | closurearg | structread | std | generic | calleedeliv
                                                                      (D157, D155)
  pval       single | two | mixed | empty | nestedempty | nullfield  (the `[[null]]` row)
  order      norm | rev                                              (genorder.py)
  rep        the payload's field type, over the whole rep vocabulary (16 levels)

EXPECTATION.  Computed HERE, never by the compiler: every cell prints exactly `7` when the
canonical payload is reached and exactly `0` when the probe value puts the default on the
read path.  A module that loads and answers the other one grades `runs but wrong value`.

STRUCTURAL ENTANGLEMENTS, declared rather than hidden.  Four coordinates carry a container
annotation whatever `annpos` says, because the language has no other spelling for them:
`store=param` (a parameter must be annotated), `deliv=calleedeliv` / `deliv=closurearg`
(a callee or lambda parameter must be), `deliv=structread` (the wrapper struct must be a
declared type), and `cont=structfield*` (an object-literal struct binding must be).  Each is
recorded on the cell so the analysis can hold it fixed instead of reading it as noise.

Usage:
    python3 gencensus.py <outdir> --block A|B|C|D|E
"""
import itertools
import json
import os
import random
import sys

# ─────────────────────────────────────────────────────────────── rep vocabulary
# rep -> (field type, canonical field value, default field value, predicate template)
REPS = {
    "i32":     ("i32", "7", "0", "{X}.r == 7"),
    "i64":     ("i64", "7", "0", "{X}.r == 7"),
    "f64":     ("f64", "7.5", "0.5", "{X}.r > 7.0"),
    "f32":     ("f32", "7.5", "0.5", "{X}.r > 7.0"),
    "bool":    ("boolean", "true", "false", "{X}.r"),
    "str":     ("string", '"seven"', '""', '{X}.r == "seven"'),
    "strlit":  ("K", '"p"', '"q"', '{X}.r == "p"'),
    "numlit":  ("N", "1", "2", "{X}.r == 1"),
    "f64lit":  ("F", "1.5", "2.5", "{X}.r == 1.5"),
    "list":    ("i32[]", "[1, 2]", "[]", "{X}.r.length == 2"),
    "map":     ("{[string]: i32}", "mkI()", "Map()", "{X}.r.size == 1"),
    "obj":     ("Inner", "{ q: 7 }", "{ q: 0 }", "{X}.r.q == 7"),
    "arm":     ("Shape2", "{ c2: 1 }", "{ s2: 1 }", "{X}.r is Cir2"),
    "nul":     ("i32 | null", "7", "null", "{X}.r != null"),
    # the payload is NOT an object shape at all: the negative control that says the
    # nominal object is load-bearing.
    "scalar":  ("i32", "7", "0", "{X} == 7"),
    "string":  ("string", '"seven"', '""', '{X} == "seven"'),
}
SCALAR_REPS = ("scalar", "string")

# ONLY the prelude the rep actually needs.  Emitting all of them would put a union
# (`Shape2`) in EVERY file and make `union=nounion` a lie — the exact failure the 900-cell
# grid made when it declared the union in all 900 files.
PRELUDE_FOR = {
    "strlit": ['type K = "p" | "q"'],
    "numlit": ["type N = 1 | 2"],
    "f64lit": ["type F = 1.5 | 2.5"],
    "obj":    ["type Inner = { q: i32 }"],
    "arm":    ["type Cir2 = { c2: i32 }", "type Sq2 = { s2: i32 }",
               "type Shape2 = Cir2 | Sq2"],
}
MKI = ('function mkI(): {[string]: i32} {\n  const mi: {[string]: i32} = Map()\n'
       '  mi["z"] = 1\n  return mi\n}')

# ─────────────────────────────────────────────────────────────────── containers
# layers OUTERMOST first: L = list, M = map, S = named struct with field `f`
CONTS = {
    "bare":         [],
    "list":         ["L"],
    "listlist":     ["L", "L"],
    "list3":        ["L", "L", "L"],
    "mapval":       ["M"],
    "nestedmap":    ["M", "M"],
    "map3":         ["M", "M", "M"],
    "forin":        ["L"],
    "map_of_list":  ["M", "L"],
    "list_of_map":  ["L", "M"],
    "structfield":  ["S", "M"],
    "structfield2": ["S", "S", "M"],
}

AXES = {
    "store":    ["local", "global", "param", "callres", "capture"],
    "escope":   ["mod", "fn", "nested", "lambda"],
    "declness": ["byname", "anon", "nodecl"],
    "twin":     ["none", "exact", "samearity", "armtwin", "late"],
    "union":    ["nounion", "unused", "used"],
    "claim":    ["0", "1", "2"],
    "cont":     list(CONTS),
    "annpos":   ["none", "binding", "dest", "retann", "readsite"],
    "deliv":    ["direct", "boundlocal", "closurearg", "structread", "std",
                 "generic", "calleedeliv"],
    "pval":     ["single", "two", "mixed", "empty", "nestedempty", "nullfield"],
    "order":    ["norm", "rev"],
    "rep":      list(REPS),
    "annpat":   ["outer", "none", "inner", "mid", "all"],
}
CORE = ["twin", "union", "claim", "store"]
REST = ["escope", "declness", "cont", "annpos", "deliv", "pval", "order", "rep"]


# ───────────────────────────────────────────────────────────────── type spelling
def payload_spelling(rep, declness):
    """How an ANNOTATION spells the payload type."""
    if rep in SCALAR_REPS:
        return REPS[rep][0]
    return "Circle" if declness == "byname" else "{r: %s}" % REPS[rep][0]


def struct_names(layers):
    """Name each S layer, innermost S = WS1.  Returns {layer index: name}."""
    names, k = {}, 0
    for i in range(len(layers) - 1, -1, -1):
        if layers[i] == "S":
            k += 1
            names[i] = "WS%d" % k
    return names


def ty_at(layers, i, p, snames):
    """The container type at layer index i (i == len(layers) is the payload)."""
    if i >= len(layers):
        return p
    lay = layers[i]
    if lay == "S":
        return snames[i]
    inner = ty_at(layers, i + 1, p, snames)
    return inner + "[]" if lay == "L" else "{[string]: %s}" % inner


def struct_decls(layers, p, snames):
    out = []
    for i in sorted(snames, reverse=True):
        out.append("type %s = { f: %s }" % (snames[i], ty_at(layers, i + 1, p, snames)))
    return out


def empty_of(layers, i, p, rep):
    """A default value for the thing at layer index i (used as a `??` default)."""
    if i >= len(layers):
        return payload_literal(rep, canonical=False)
    return "[]" if layers[i] == "L" else "Map()"


def payload_literal(rep, canonical=True, nullfield=False):
    ft, cv, dv, _ = REPS[rep]
    if rep in SCALAR_REPS:
        return cv if canonical else dv
    if nullfield:
        return "{ r: null }"
    return "{ r: %s }" % (cv if canonical else dv)


# ─────────────────────────────────────────────────────────────────── the builder
def build_stmts(layers, p, snames, rep, pval, ind, cname, ann, annpat="outer"):
    """Statements constructing `cname`.  `ann` is the annotation to hang on it or ''.

    `annpat` says which INTERMEDIATE levels also carry one.  Block A's `annpos` axis only
    ever annotated the OUTERMOST binding, and the minimisation of block C's silent cells
    found the discriminator is which intermediate level is annotated: annotating the
    middle level of a three-deep list makes a silent program run, annotating the innermost
    does not.  No grid in this programme had that axis.
        outer  -- only the outermost binding (what every earlier grid did)
        none   -- nothing (the outer `ann` is dropped too)
        inner  -- the INNERMOST intermediate level, plus the outer binding
        mid    -- every intermediate level EXCEPT the innermost, plus the outer binding
        all    -- every level"""
    L = []
    n = len(layers)
    # innermost slot contents
    nullf = pval == "nullfield"
    v0 = payload_literal(rep, True, nullf)
    v1 = payload_literal(rep, False)
    if pval == "two":
        slots = [v0, v0]
    elif pval == "mixed":
        slots = [v0, v1]
    else:
        slots = [v0]
    if pval == "nestedempty":
        inner_slots = []
    else:
        inner_slots = slots
    if n == 0:
        L.append("%sconst %s%s = %s" % (ind, cname, ann, v0))
        return L
    # build from innermost layer outward
    cur = None                       # expression naming the level built so far
    for i in range(n - 1, -1, -1):
        outermost = (i == 0)
        nm = cname if outermost else "lv%d" % i
        if outermost:
            a = "" if annpat == "none" else ann
        elif annpat == "all" or (annpat == "inner" and i == n - 1) \
                or (annpat == "mid" and i != n - 1):
            a = ": " + ty_at(layers, i, p, snames)
        else:
            a = ""
        lay = layers[i]
        innervals = inner_slots if i == n - 1 else ([cur] if cur is not None else [])
        if outermost and pval == "empty":
            innervals = []
        if lay == "L":
            L.append("%sconst %s%s = [%s]" % (ind, nm, a, ", ".join(innervals)))
        elif lay == "M":
            L.append("%sconst %s%s = Map()" % (ind, nm, a))
            for j, v in enumerate(innervals):
                L.append('%s%s["k%d"] = %s' % (ind, nm, j, v))
        elif lay == "S":
            # A struct field always holds exactly one thing, and an object-literal
            # struct binding must name its type: measured, `const w = { f: m }` is a
            # LOUD emit reject (`object literal matches no union variant`) while
            # `const w: WS = { f: m }` runs.  So EVERY S layer is annotated whatever
            # `annpos` says; the cell records it as a structural annotation.
            if not a:
                a = ": " + ty_at(layers, i, p, snames)
            L.append("%sconst %s%s = { f: %s }" % (ind, nm, a, innervals[0]))
        cur = nm
    return L


def read_stmts(layers, p, snames, rep, pval, ind, expr, readsite, forin):
    """Statements printing 7 when the canonical payload is reached, 0 otherwise."""
    pred = REPS[rep][3]
    n = len(layers)

    def go(i, e, ii):
        if i == n:
            if readsite:
                return ["%sconst gp: %s = %s" % (ii, p, e),
                        "%sif %s { print(7) } else { print(0) }" % (ii, pred.format(X="gp"))]
            return ["%sif %s { print(7) } else { print(0) }" % (ii, pred.format(X="(%s)" % e))]
        lay = layers[i]
        if lay == "S":
            return go(i + 1, "(%s).f" % e, ii)
        if lay == "M":
            nm = "g%d" % i
            d = ("dfl" if (readsite and i == n - 1)
                 else empty_of(layers, i + 1, p, rep))
            return ["%sconst %s = (%s)[\"k0\"] ?? %s" % (ii, nm, e, d)] + go(i + 1, nm, ii)
        nm = "g%d" % i
        return ["%sconst %s = %s" % (ii, nm, e),
                "%sif %s.length > 0 {" % (ii, nm)] + \
            go(i + 1, "%s[0]" % nm, ii + "  ") + \
            ["%s} else { print(0) }" % ii]

    if forin:
        return ["%slet hit = 0" % ind,
                "%sfor zz in %s {" % (ind, expr),
                "%s  if %s { hit = 7 }" % (ind, pred.format(X="zz")),
                "%s}" % ind,
                "%sprint(hit)" % ind]
    return go(0, expr, ind)


# ───────────────────────────────────────────────────────────── structural skips
def skip_reason(c):
    layers = CONTS[c["cont"]]
    n = len(layers)
    # store x escope realizability
    if c["store"] == "local" and c["escope"] == "mod":
        return "a local needs a function to be local to"
    if c["store"] == "param" and c["escope"] == "mod":
        return "a parameter needs a function to be a parameter of"
    if c["store"] == "capture" and c["escope"] in ("mod", "fn"):
        return "a capture needs an enclosing scope to capture from"
    # payload declaredness
    if c["rep"] in SCALAR_REPS and c["declness"] != "nodecl":
        return "a scalar payload has no object shape to declare"
    # probe value
    if c["pval"] == "nullfield" and c["rep"] != "nul":
        return "only the `nul` rep has a field that can be null"
    if c["pval"] in ("two", "mixed") and n == 0:
        return "a bare binding has one slot"
    if c["pval"] in ("two", "mixed") and layers[-1] == "S":
        return "a struct field has one slot"
    if c["pval"] == "empty" and (n == 0 or layers[0] == "S"):
        return "the outermost layer cannot be empty"
    if c["pval"] == "nestedempty" and (n < 2 or layers[-1] == "S"):
        return "no inner container to empty"
    # declaration order
    if c["order"] == "rev" and n_decl_lines(c) < 2:
        return "fewer than two reorderable declaration lines"
    return None


def n_decl_lines(c):
    k = 0
    if c["rep"] not in SCALAR_REPS and c["declness"] != "nodecl":
        k += 1
    if c["twin"] != "none":
        k += 1
    if c["twin"] == "armtwin":
        k += 2
    if c["union"] != "nounion":
        k += 2
    k += int(c["claim"])
    return k


# ────────────────────────────────────────────────────────────────── the emitter
def emit(c):
    """Return (program text, expected stdout) or raise AssertionError."""
    rep, declness = c["rep"], c["declness"]
    ft = REPS[rep][0]
    p = payload_spelling(rep, declness)
    layers = CONTS[c["cont"]]
    snames = struct_names(layers)
    ct = ty_at(layers, 0, p, snames)
    forin = c["cont"] == "forin"
    readsite = c["annpos"] == "readsite"
    n = len(layers)

    # ---- declaration block (the `order` axis reverses exactly this) -----------
    decls = []
    if rep not in SCALAR_REPS and declness != "nodecl":
        decls.append("type Circle = { r: %s }" % ft)
    if c["twin"] == "exact":
        decls.append("type Dot = { r: %s }" % ft)
    elif c["twin"] == "samearity":
        decls.append("type Dot = { q: %s }" % ft)
    elif c["twin"] == "armtwin":
        decls.append("type Dot = { r: %s }" % ft)
        decls.append("type DotB = { db: i32 }")
        decls.append("type DotU = Dot | DotB")
    # twin=late is emitted AFTER the reader, below.
    if c["union"] != "nounion":
        decls.append("type Sq = { s: i32 }")
        arm = "Circle" if (rep not in SCALAR_REPS and declness != "nodecl") else "Ua"
        if arm == "Ua":
            decls.append("type Ua = { ua: i32 }")
        decls.append("type Shape = %s | Sq" % arm)
    for k in range(int(c["claim"])):
        decls.append("type Box%d = %s" % (k + 1, ct))
    if c["order"] == "rev":
        decls = list(reversed(decls))

    head = []
    if c["deliv"] == "std":
        head.append('import { reverse } from "std:array"')
    head += PRELUDE_FOR.get(rep, [])
    if rep == "map":
        head.append(MKI)
    head += decls
    head += struct_decls(layers, p, snames)

    # ---- helper declarations -------------------------------------------------
    if c["deliv"] == "generic":
        head.append("function idg<T>(x: T): T { return x }")
    if c["deliv"] == "calleedeliv":
        head.append("function thru(x: %s) { return x }" % ct)
    if c["deliv"] == "structread":
        head.append("type GW = { g: %s }" % ct)
    if c["annpos"] == "dest":
        head.append("function sink(_x: %s) { }" % ct)
    if c["union"] == "used":
        head.append("function useShape(s: Shape): i32 { if s is Sq { return 1 } return 0 }")
        head.append("const sqv: Sq = { s: 1 }")
    for k in range(int(c["claim"])):
        head.append("const _sp%d: Box%d = %s" % (k + 1, k + 1, empty_container(layers, p, snames, rep)))
    if readsite:
        head.append("const dfl: %s = %s" % (p, payload_literal(rep, False)))

    # ---- build / deliver / read ---------------------------------------------
    ann_binding = (": " + ct) if c["annpos"] == "binding" else ""
    # structural necessity: an object-literal struct binding must name its type.
    if n and layers[0] == "S" and not ann_binding:
        ann_binding = ": " + ct

    def build(ind, cname):
        return build_stmts(layers, p, snames, rep, c["pval"], ind, cname, ann_binding,
                           c.get("annpat", "outer"))

    def deliver(ind, src):
        """Statements turning `src` into the expression the read consumes."""
        d = c["deliv"]
        if d == "direct":
            return [], src
        if d == "boundlocal":
            return ["%sconst dd = %s" % (ind, src)], "dd"
        if d == "closurearg":
            return ["%sconst lamc = (x: %s) => x" % (ind, ct),
                    "%sconst dd = lamc(%s)" % (ind, src)], "dd"
        if d == "structread":
            return ["%sconst wv: GW = { g: %s }" % (ind, src)], "wv.g"
        if d == "std":
            return ["%sconst dd = reverse([%s])[0]" % (ind, src)], "dd"
        if d == "generic":
            return ["%sconst dd = idg(%s)" % (ind, src)], "dd"
        if d == "calleedeliv":
            return ["%sconst dd = thru(%s)" % (ind, src)], "dd"
        raise AssertionError(d)

    def dest(ind, src):
        return ["%ssink(%s)" % (ind, src)] if c["annpos"] == "dest" else []

    def useblk(ind):
        return ["%sif useShape(sqv) > 99 { print(0) }" % ind] if c["union"] == "used" else []

    def readblk(ind, expr):
        return read_stmts(layers, p, snames, rep, c["pval"], ind, expr, readsite, forin)

    # `annpos=retann` routes the container through a maker whose RESULT is annotated.
    maker = []
    if c["annpos"] == "retann":
        maker.append("function mkc(): %s {" % ct)
        maker += build("  ", "cc")
        maker.append("  return cc")
        maker.append("}")
        src_expr = "mkc()"
    else:
        src_expr = None

    body = []
    store, escope = c["store"], c["escope"]

    def place(ind):
        """build + dest + deliver + read at one indent, returning the lines."""
        out = []
        if src_expr:
            out.append("%sconst c = %s" % (ind, src_expr))
        else:
            out += build(ind, "c")
        out += dest(ind, "c")
        dl, rexpr = deliver(ind, "c")
        out += dl
        out += useblk(ind)
        out += readblk(ind, rexpr)
        return out

    def readonly(ind, src):
        out = list(dest(ind, src))
        dl, rexpr = deliver(ind, src)
        out += dl
        out += useblk(ind)
        out += readblk(ind, rexpr)
        return out

    if store == "global":
        if src_expr:
            body.append("const c = %s" % src_expr)
        else:
            body += build("", "c")
        if escope == "mod":
            body += readonly("", "c")
        elif escope == "fn":
            body.append("function rd() {")
            body += readonly("  ", "c")
            body.append("}")
            body.append("rd()")
        elif escope == "nested":
            body.append("function outer() {")
            body.append("  function inner() {")
            body += readonly("    ", "c")
            body.append("  }")
            body.append("  inner()")
            body.append("}")
            body.append("outer()")
        else:
            body.append("function outer() {")
            body.append("  const lam = () => {")
            body += readonly("    ", "c")
            body.append("  }")
            body.append("  lam()")
            body.append("}")
            body.append("outer()")
    elif store == "local":
        if escope == "fn":
            body.append("function rd() {")
            body += place("  ")
            body.append("}")
            body.append("rd()")
        elif escope == "nested":
            body.append("function outer() {")
            body.append("  function inner() {")
            body += place("    ")
            body.append("  }")
            body.append("  inner()")
            body.append("}")
            body.append("outer()")
        else:
            body.append("function outer() {")
            body.append("  const lam = () => {")
            body += place("    ")
            body.append("  }")
            body.append("  lam()")
            body.append("}")
            body.append("outer()")
    elif store == "param":
        body.append("function mksrc() {")
        if src_expr:
            body.append("  const cc = %s" % src_expr)
        else:
            body += build("  ", "cc")
        body.append("  return cc")
        body.append("}")
        body.append("function rd(c: %s) {" % ct)
        if escope == "fn":
            body += readonly("  ", "c")
        elif escope == "nested":
            body.append("  function inner() {")
            body += readonly("    ", "c")
            body.append("  }")
            body.append("  inner()")
        else:
            body.append("  const lam = () => {")
            body += readonly("    ", "c")
            body.append("  }")
            body.append("  lam()")
        body.append("}")
        body.append("rd(mksrc())")
    elif store == "callres":
        if src_expr:
            body.append("function mkcall() { return %s }" % src_expr)
        else:
            body.append("function mkcall() {")
            body += build("  ", "cc")
            body.append("  return cc")
            body.append("}")
        if escope == "mod":
            body += readonly("", "mkcall()")
        elif escope == "fn":
            body.append("function rd() {")
            body += readonly("  ", "mkcall()")
            body.append("}")
            body.append("rd()")
        elif escope == "nested":
            body.append("function outer() {")
            body.append("  function inner() {")
            body += readonly("    ", "mkcall()")
            body.append("  }")
            body.append("  inner()")
            body.append("}")
            body.append("outer()")
        else:
            body.append("function outer() {")
            body.append("  const lam = () => {")
            body += readonly("    ", "mkcall()")
            body.append("  }")
            body.append("  lam()")
            body.append("}")
            body.append("outer()")
    else:  # capture
        body.append("function outer() {")
        if src_expr:
            body.append("  const c = %s" % src_expr)
        else:
            body += build("  ", "c")
        if escope == "nested":
            body.append("  function inner() {")
            body += readonly("    ", "c")
            body.append("  }")
            body.append("  inner()")
        else:
            body.append("  const lam = () => {")
            body += readonly("    ", "c")
            body.append("  }")
            body.append("  lam()")
        body.append("}")
        body.append("outer()")

    tail = []
    if c["twin"] == "late":
        tail.append("type Dot = { r: %s }" % ft)

    text = "\n".join(head + maker + body + tail) + "\n"
    expected = "0" if c["pval"] in ("empty", "nestedempty", "nullfield") else "7"
    return text, expected


def empty_container(layers, p, snames, rep):
    """A constructible value of the container type, for a `claim` spare."""
    if not layers:
        return payload_literal(rep, False)
    lay = layers[0]
    if lay == "L":
        return "[]"
    if lay == "M":
        return "Map()"
    return "{ f: %s }" % empty_container(layers[1:], p, snames, rep)


# ──────────────────────────────────────────────────────── pairwise covering array
def rest_valid(r):
    """The constraints that live ENTIRELY inside the rest axes.  A covering array that
    ignores them spends most of its rows on coordinates the generator then skips, which
    silently deletes the pairwise guarantee it was built to provide."""
    cont = r.get("cont")
    layers = CONTS[cont] if cont else None
    if r.get("rep") in SCALAR_REPS and r.get("declness", "nodecl") != "nodecl":
        return False
    if r.get("pval") == "nullfield" and r.get("rep") != "nul":
        return False
    if layers is not None:
        n = len(layers)
        if r.get("pval") in ("two", "mixed") and (n == 0 or layers[-1] == "S"):
            return False
        if r.get("pval") == "empty" and (n == 0 or layers[0] == "S"):
            return False
        if r.get("pval") == "nestedempty" and (n < 2 or layers[-1] == "S"):
            return False
    return True


def pairwise(axes, seed=20260827, tries=500, valid=None):
    """Greedy strength-2 covering array over {name: [levels]}: every PAIR of values
    drawn from two different axes appears in at least one row.

    Best-of-`tries` random candidates per row, scored against the pairs still uncovered.
    `pairs_covered()` re-derives the guarantee from the returned rows, so the coverage
    claim is checked rather than asserted."""
    rnd = random.Random(seed)
    names = sorted(axes)
    # a pair is REACHABLE only if some fully-assigned valid row contains it; sample to
    # find out, and report the unreachable ones rather than looping on them forever.
    reach = {(a, b): set() for a, b in itertools.combinations(names, 2)}
    pool = []
    for _ in range(200000):
        row = {nm: rnd.choice(axes[nm]) for nm in names}
        if valid and not valid(row):
            continue
        pool.append(row)
        for a, b in reach:
            reach[(a, b)].add((row[a], row[b]))
        if len(pool) >= 40000:
            break
    need = {ab: set(s) for ab, s in reach.items()}
    unreachable = sum(len(axes[a]) * len(axes[b]) - len(reach[(a, b)])
                      for a, b in reach)
    rows = []
    while any(need.values()):
        best, bestcov = None, -1
        remaining = sum(len(s) for s in need.values())
        for _ in range(tries):
            row = rnd.choice(pool)
            cov = sum(1 for ab, s in need.items()
                      if (row[ab[0]], row[ab[1]]) in s)
            if cov > bestcov:
                best, bestcov = row, cov
                if cov == remaining:
                    break
        rows.append(best)
        for (a, b), s in need.items():
            s.discard((best[a], best[b]))
    return rows, unreachable


def pairs_covered(rows, axes):
    """(covered, total) pairs over the axes, re-derived from the rows themselves."""
    names = sorted(axes)
    total = 0
    seen = set()
    for a, b in itertools.combinations(names, 2):
        total += len(axes[a]) * len(axes[b])
        for r in rows:
            seen.add((a, r[a], b, r[b]))
    return len(seen), total


# ─────────────────────────────────────────────────────────────────────── blocks
STORESCOPE = [(s, e) for s in AXES["store"] for e in AXES["escope"]
              if not (s == "local" and e == "mod")
              and not (s == "param" and e == "mod")
              and not (s == "capture" and e in ("mod", "fn"))]


def block_A():
    """The CORE — twin x union x claim x (store, escope) — FULLY crossed against a
    constraint-aware pairwise covering array over the seven remaining axes.

    `store` and `escope` are crossed as one joint level set because four of their twenty
    combinations have no spelling; leaving them independent would have thrown a fifth of
    the array away as structural skips and taken the pairwise guarantee with it."""
    restax = [k for k in REST if k != "escope"]
    ax = {k: AXES[k] for k in restax}
    rest, unreach = pairwise(ax, valid=rest_valid)
    cov, tot = pairs_covered(rest, ax)
    core = [(t, u, c, s, e) for t, u, c in
            itertools.product(AXES["twin"], AXES["union"], AXES["claim"])
            for s, e in STORESCOPE]
    out = []
    for t, u, cl, s, e in core:
        for r in rest:
            c = dict(twin=t, union=u, claim=cl, store=s, escope=e)
            c.update(r)
            out.append(c)
    return out, {"rest_rows": len(rest), "core_rows": len(core),
                 "rest_pairs_covered": "%d/%d" % (cov, tot),
                 "rest_pairs_unreachable_by_construction": unreach,
                 "storescope_pairs": len(STORESCOPE)}


def block_B():
    """cont x annpos x deliv x pval FULLY crossed — the four axes whose interaction the
    per-row grids each held partly fixed — at three core corners and five (store, escope)
    pairs chosen to touch every level of both.

    The (declness, order, rep) fill rotates through a pairwise covering array of those
    three axes, re-drawn per (cont, pval) so it satisfies that coordinate's constraints
    instead of being thrown away as a skip."""
    corners = [("none", "nounion", "0"), ("exact", "unused", "1"), ("armtwin", "used", "2")]
    sscope = [("local", "fn"), ("global", "mod"), ("param", "nested"),
              ("callres", "lambda"), ("capture", "nested")]
    fillax = {k: AXES[k] for k in ("declness", "order", "rep")}
    fill, _un = pairwise(fillax, valid=rest_valid)
    out = []
    i = 0
    for cont, annpos, deliv, pval in itertools.product(
            AXES["cont"], AXES["annpos"], AXES["deliv"], AXES["pval"]):
        probe = dict(cont=cont, pval=pval)
        # a fill row that makes THIS (cont, pval) representable; the rotation keeps the
        # (declness, order, rep) axes moving across the block rather than pinned.
        chosen = None
        for k in range(len(fill)):
            f = fill[(i + k) % len(fill)]
            t = dict(probe)
            t.update(f)
            if rest_valid(t):
                chosen = f
                i += k + 1
                break
        if chosen is None:
            continue
        for twin, union, claim in corners:
            for store, escope in sscope:
                c = dict(cont=cont, annpos=annpos, deliv=deliv, pval=pval,
                         twin=twin, union=union, claim=claim,
                         store=store, escope=escope)
                c.update(chosen)
                out.append(c)
    return out, {"fill_rows": len(fill), "storescope_sample": len(sscope),
                 "corners": len(corners)}


def block_C():
    """rep x cont FULLY crossed against the FULL core quartet, rest axes canonical."""
    base = dict(escope="fn", declness="byname", annpos="binding", deliv="direct",
                pval="single", order="norm")
    out = []
    for rep, cont in itertools.product(AXES["rep"], AXES["cont"]):
        for twin, union, claim, store in itertools.product(*[AXES[k] for k in CORE]):
            c = dict(base)
            c.update(rep=rep, cont=cont, twin=twin, union=union, claim=claim, store=store)
            # `capture` has no function-body spelling: it needs an enclosing scope.
            # Pinning escope=fn for every store would silently delete the whole
            # `capture` level from this block, which is the axis D139 turned on.
            if store == "capture":
                c["escope"] = "nested"
            if rep in SCALAR_REPS:
                c["declness"] = "nodecl"
            out.append(c)
    return out, {}


def block_D():
    """THE INTERMEDIATE-ANNOTATION AXIS, at the coordinate with NO type declarations at all.

    Block C's smallest silent cell has no `type` line anywhere, no union, no twin, no map
    and no object: a three-deep list of `string` built through un-annotated intermediate
    locals.  That is outside every family filed so far, so this block sizes it directly:
    container x WHICH level is annotated x rep x storage, with twin=none, union=nounion,
    claim=0 and declness=nodecl held at their empty values so nothing nominal is present.

    The `declness=byname` leg is generated alongside it as the paired control, so the
    question "does the family need a declared shape at all" is answered rather than
    assumed."""
    sscope = [("local", "fn"), ("global", "mod"), ("param", "nested"),
              ("callres", "lambda"), ("capture", "nested")]
    out = []
    for cont in AXES["cont"]:
        for annpat in AXES["annpat"]:
            for rep in AXES["rep"]:
                for declness in ("nodecl", "byname"):
                    if rep in SCALAR_REPS and declness != "nodecl":
                        continue
                    for store, escope in sscope:
                        out.append(dict(
                            cont=cont, annpat=annpat, rep=rep, declness=declness,
                            store=store, escope=escope, twin="none", union="nounion",
                            claim="0", annpos="binding", deliv="direct",
                            pval="single", order="norm"))
    return out, {"storescope_sample": len(sscope)}


def block_E():
    """The ORDER and PROBE-VALUE axes, PAIRED.

    Blocks A-D leave only twenty one-step sibling pairs that differ in `order` alone and
    1,788 that differ in `pval` alone, because the covering array fixes one value of each
    per row.  A marginal rate over an unpaired population is not a reading of the axis —
    `order=rev` needs two reorderable declaration lines, so its cells carry more nominal
    ingredients than `order=norm`'s and the difference is the ingredients.  This block
    crosses both axes exhaustively against the nominal ingredients, so every cell has its
    exact twin."""
    out = []
    for cont in AXES["cont"]:
        for twin, union, claim in itertools.product(
                AXES["twin"], AXES["union"], AXES["claim"]):
            for order in AXES["order"]:
                for pval in AXES["pval"]:
                    for rep in ("i32", "arm", "str", "nul"):
                        out.append(dict(
                            cont=cont, twin=twin, union=union, claim=claim,
                            order=order, pval=pval, rep=rep,
                            store="local", escope="fn", declness="byname",
                            annpos="binding", deliv="direct", annpat="outer"))
    return out, {}


def main():
    out = sys.argv[1]
    blk = sys.argv[sys.argv.index("--block") + 1]
    os.makedirs(out, exist_ok=True)
    cells, meta = {"A": block_A, "B": block_B, "C": block_C,
               "D": block_D, "E": block_E}[blk]()
    expect, coords, skips = {}, {}, {}
    n = 0
    for c in cells:
        why = skip_reason(c)
        if why:
            skips[why] = skips.get(why, 0) + 1
            continue
        name = "%s%06d" % (blk.lower(), n)
        text, exp = emit(c)
        with open(os.path.join(out, name + ".vl"), "w") as fh:
            fh.write(text)
        expect[name] = exp
        coords[name] = c
        n += 1
    json.dump({"expect": expect, "coords": coords, "skips": skips,
               "block": blk, "meta": meta, "generated": n,
               "considered": len(cells)},
              open(os.path.join(out, "manifest.json"), "w"))
    print("block %s: considered=%d generated=%d skipped=%d" %
          (blk, len(cells), n, len(cells) - n))
    for k in sorted(skips, key=lambda k: -skips[k]):
        print("  skip %7d  %s" % (skips[k], k))
    for k, v in meta.items():
        print("  meta %s = %s" % (k, v))


if __name__ == "__main__":
    main()
