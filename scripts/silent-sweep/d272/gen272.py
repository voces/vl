#!/usr/bin/env python3
"""THE UNION-BOX READ GRID — the axis the adoption grid and the census both hold fixed.

The D209 rung lives in `emitUnionFieldNarrowUnbox`, whose FIRST rung is the narrow and
whose SECOND (new) rung is the checker's recorded type for an UN-narrowed read.  No
earlier grid varies HOW a code-16 field is read: `cells209` reads every cell bare, and the
census's `rep` axis varies the field's TYPE, never the read form.  This grid crosses them.

  fld    the declared code-16 field's union spelling (9)
  read   bare | isnar | nullcmp | tounion | tofld (5)
         - bare     un-narrowed: the rung's new arm
         - isnar    `is <atom>` narrowed: the rung's OLD arm, which must not move
         - nullcmp  `!= null` narrowed
         - tounion  the read is stored into a UNION-typed local — the consumer that
                    WANTS the box, i.e. the case the new arm must decline
         - tofld    the read is stored into ANOTHER code-16 field — the second
                    box-wanting consumer, and the one that crosses two boxes
  cont   bare | list | listlist | mapval | map_of_list | list_of_map | forin (7)
  annpat none | bind | dest | destdeep (4)

Every cell prints exactly `7`.
"""
import os, sys
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# fld -> (field type spelling, payload literal, narrow atom, USE(x) stmt, BARE(E) stmt, decls)
FLDS = {
 "nulint": ("i32 | null",    "{ r: 7 }",         "i32",     lambda x: f"print({x})",
            lambda e: f"print(({e}).r)", ""),
 "nuli64": ("i64 | null",    "{ r: 7 }",         "i64",     lambda x: f"print({x})",
            lambda e: f"print(({e}).r)", ""),
 "nulf64": ("f64 | null",    "{ r: 7 }",         "f64",     lambda x: f"print({x})",
            lambda e: f"print(({e}).r)", ""),
 "nulbool":("boolean | null","{ r: true }",      "boolean", lambda x: f"if {x} {{ print(7) }} else {{ print(0) }}",
            lambda e: f"if ({e}).r {{ print(7) }} else {{ print(0) }}", ""),
 "nulstr": ("string | null", '{ r: "7" }',       "string",  lambda x: f"print({x})",
            lambda e: f"print(({e}).r)", ""),
 "unis":   ("i32 | string",  "{ r: 7 }",         "i32",     lambda x: f"print({x})",
            lambda e: f"print(({e}).r)", ""),
 "arm":    ("Shape2",        "{ r: { c2: 7 } }", "Cir2",    lambda x: f"print(({x}).c2)",
            lambda e: f"print((({e}).r).c2)",
            "type Cir2 = { c2: i32 }\ntype Sq2 = { s2: i32 }\ntype Shape2 = Cir2 | Sq2"),
 "lit2":   ("K2 | null",     '{ r: "a" }',       "K2",      lambda x: "print(7)",
            lambda e: f'if ({e}).r == "a" {{ print(7) }} else {{ print(0) }}',
            'type K2 = "a" | "b"'),
 "i32arr": ("i32[] | null",  "{ r: [7] }",       "i32[]",   lambda x: f"print(({x})[0])",
            lambda e: f"print((({e}).r)[0])", ""),
}
READS = ["bare", "isnar", "nullcmp", "tounion", "tofld"]
CONTS = ["bare", "list", "listlist", "mapval", "map_of_list", "list_of_map", "forin"]
ANNS  = ["none", "bind", "dest", "destdeep"]
VTY = {"bare": "Circle", "list": "Circle[]", "listlist": "(Circle[])[]",
       "mapval": "{[string]: Circle}", "map_of_list": "{[string]: Circle[]}",
       "list_of_map": "({[string]: Circle})[]", "forin": "Circle[]"}

def reader(rd, e, fty, atom, use, bare):
    if rd == "bare":    return bare(e)
    if rd == "isnar":   return f"if ({e}).r is {atom} {{ {use(f'({e}).r')} }} else {{ print(0) }}"
    if rd == "nullcmp": return f"if ({e}).r != null {{ {use(f'({e}).r')} }} else {{ print(0) }}"
    if rd == "tounion": return (f"const q: {fty} = ({e}).r\n"
                                f"if q is {atom} {{ {use('q')} }} else {{ print(0) }}")
    if rd == "tofld":   return (f"const w: Box2 = {{ s: ({e}).r }}\n"
                                f"if w.s is {atom} {{ {use('w.s')} }} else {{ print(0) }}")
    raise AssertionError(rd)

n = 0
for fname, (fty, payload, atom, use, bare, decls) in FLDS.items():
    for rd in READS:
        for cont in CONTS:
            for ann in ANNS:
                L = []
                if decls: L.append(decls)
                L.append("type Circle = { r: %s }" % fty)
                if rd == "tofld": L.append("type Box2 = { s: %s }" % fty)
                vty = VTY[cont]
                ba = ": " + vty if ann == "bind" else ""
                R = lambda e: reader(rd, e, fty, atom, use, bare)
                if cont == "bare":
                    L.append(f"const v{ba} = {payload}"); read = R("v")
                elif cont == "list":
                    L.append(f"const v{ba} = [{payload}]"); read = R("v[0]")
                elif cont == "listlist":
                    L.append(f"const v{ba} = [[{payload}]]"); read = R("v[0][0]")
                elif cont == "mapval":
                    L.append(f"const v{ba} = Map()"); L.append(f'v["k"] = {payload}')
                    L.append(f'const g = v["k"] ?? {payload}'); read = R("g")
                elif cont == "map_of_list":
                    L.append(f"const lv = [{payload}]"); L.append(f"const v{ba} = Map()")
                    L.append('v["k"] = lv'); L.append('const g = v["k"] ?? []')
                    read = "if g.length > 0 {\n%s\n} else { print(0) }" % R("g[0]")
                elif cont == "list_of_map":
                    L.append("const m = Map()"); L.append(f'm["k"] = {payload}')
                    L.append(f"const v{ba} = [m]")
                    L.append(f'const g = (v[0])["k"] ?? {payload}'); read = R("g")
                elif cont == "forin":
                    L.append(f"const v{ba} = [{payload}]")
                    read = "for z in v {\n%s\n}" % R("z")
                if ann == "dest":       L.append(f"const c2: {vty} = v")
                elif ann == "destdeep": L.append(f"const c2: ({vty})[] = [v]")
                L.append(read)
                src = "\n".join(x for x in L if x) + "\n"
                open(os.path.join(OUT, f"{fname}_{rd}_{cont}_{ann}.vl"), "w").write(src)
                n += 1
print("generated", n, "cells in", OUT)
