#!/usr/bin/env python3
"""THE UNION-BOX READ **CHANNEL** GRID — D209's two ends, and the atom-agreement axis.

`d272` put the `read` axis on the map and that is what refuted D209's read-side
candidate: `tounion` and `tofld` are consumers that WANT the box, and a read-site unbox
cannot see them.  This grid keeps that axis (widened to ten CONSUMERS, because
`exprUnion` — the classifier the paired candidate also moves — has 28 call sites) and
adds the one `d272` holds fixed:

  shape  the (declared code-16 field union, literal payload) PAIR.  `d272` varies the
         field spelling with the payload pinned per field, so it never separates
             the checker's atom AGREES with a declared member   (`{r:7}` : `i32|null`)
         from
             the checker's atom is NOT a member at all          (`{r:7}` : `i64|null`)
         and that distinction is exactly what decides whether a read-site unbox picks
         the atom the STORE boxed or a different one.  Three sources can disagree here
         (declared member, stored payload, checker type); the axis makes which pair
         disagrees an independent coordinate.

  cons   the consumer of the read (10) — print · local rebind · union binding · another
         code-16 field · a union PARAM · a union RETURN · a union-element list · `==`
         against the literal · `is <atom>` · `!= null`.
  cont   how the receiver is stored: bare · list · mapval (3)
  annpat none | bind (2)

720 cells.  Every cell prints exactly `7`.

    python3 scripts/silent-sweep/d290/gen290.py /tmp/g290
    JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/g290 <seed.wasm> /tmp/g290.json
"""
import os, sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# name -> (field type, payload literal, narrow atom, eq literal, printer, extra decls)
def pv(x): return f"print({x})"
def pb(x): return f"if {x} {{ print(7) }} else {{ print(0) }}"
def parm(x): return f"print(({x}).c2)"

SHAPES = {
    # the checker's atom for the payload IS a declared member — the rung's own family
    "i32nul":   ("i32 | null",     "7",          "i32",     "7",   pv,   ""),
    "i32str":   ("i32 | string",   "7",          "i32",     "7",   pv,   ""),
    "i32i64":   ("i32 | i64",      "7",          "i32",     "7",   pv,   ""),
    "stri32":   ("string | i32",   '"7"',        "string",  '"7"', pv,   ""),
    "booli32":  ("boolean | i32",  "true",       "boolean", "true",pb,   ""),
    "f64str":   ("f64 | string",   "7.0",        "f64",     "7.0", pv,   ""),
    # the checker's atom is NOT a declared member — the WIDENED store, three sources
    "i64nul":   ("i64 | null",     "7",          "i64",     "7",   pv,   ""),
    "f64nul":   ("f64 | null",     "7",          "f64",     "7",   pv,   ""),
    "i64str":   ("i64 | string",   "7",          "i64",     "7",   pv,   ""),
    # controls: the two NICHE spellings (not a code-16 box) and the struct-arm union
    "strnul":   ("string | null",  '"7"',        "string",  '"7"', pv,   ""),
    "boolnul":  ("boolean | null", "true",       "boolean", "true",pb,   ""),
    "arm":      ("Shape2",         "{ c2: 7 }",  "Cir2",    "",    parm,
                 "type Cir2 = { c2: i32 }\ntype Sq2 = { s2: i32 }\ntype Shape2 = Cir2 | Sq2"),
}

CONS = ["print", "local", "tounion", "tofld", "arg", "ret", "elem", "eqlit",
        "isnar", "nullcmp"]
CONTS = ["bare", "list", "mapval"]
ANNS = ["none", "bind"]
VTY = {"bare": "Circle", "list": "Circle[]", "mapval": "{[string]: Circle}"}


def body(cons, E, fty, atom, eqlit, pr):
    """The consumer's statements, reading `(E).r`."""
    rd = f"({E}).r"
    guard = lambda v: f"if {v} is {atom} {{ {pr(v)} }} else {{ print(0) }}"
    if cons == "print":   return [pr(rd)]
    if cons == "local":   return [f"const z = {rd}", pr("z")]
    if cons == "tounion": return [f"const q: {fty} = {rd}", guard("q")]
    if cons == "tofld":   return [f"const w: Box2 = {{ s: {rd} }}", guard("w.s")]
    if cons == "arg":     return [f"sink({rd})"]
    if cons == "ret":     return [f"const q2 = g()", guard("q2")]
    if cons == "elem":    return [f"const xs: {fty}[] = [{rd}]", guard("xs[0]")]
    if cons == "eqlit":   return [f"if {rd} == {eqlit} {{ print(7) }} else {{ print(0) }}"]
    if cons == "isnar":   return [guard(rd)]
    if cons == "nullcmp": return [f"if {rd} != null {{ {pr(rd)} }} else {{ print(0) }}"]
    raise AssertionError(cons)


n = 0
for sname, (fty, payload, atom, eqlit, pr, decls) in SHAPES.items():
    for cons in CONS:
        if cons == "eqlit" and eqlit == "":
            continue
        for cont in CONTS:
            for ann in ANNS:
                L = []
                if decls:
                    L.append(decls)
                L.append("type Circle = { r: %s }" % fty)
                if cons == "tofld":
                    L.append("type Box2 = { s: %s }" % fty)
                lit = "{ r: %s }" % payload
                ba = ": " + VTY[cont] if ann == "bind" else ""
                if cont == "bare":
                    L.append(f"const v{ba} = {lit}")
                    E = "v"
                elif cont == "list":
                    L.append(f"const lv1{ba} = [{lit}]")
                    E = "lv1[0]"
                else:
                    L.append(f"const mv1{ba} = Map()" if ann != "bind"
                             else f"const mv1: {VTY['mapval']} = Map()")
                    L.append(f'mv1["k"] = {lit}')
                    E = 'mv1["k"] ?? %s' % lit
                if cons == "arg":
                    L.append(
                        "function sink(u: %s) { if u is %s { %s } else { print(0) } }"
                        % (fty, atom, pr("u")))
                if cons == "ret":
                    L.append("function g(): %s { return (%s).r }" % (fty, E))
                L.extend(body(cons, E, fty, atom, eqlit, pr))
                name = f"{sname}_{cons}_{cont}_{ann}.vl"
                open(os.path.join(OUT, name), "w").write("\n".join(L) + "\n")
                n += 1
print(f"generated {n} cells in {OUT}")
