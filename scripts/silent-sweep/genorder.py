#!/usr/bin/env python3
"""
Leg G — the DECLARATION-ORDER axis.

A container type (struct field / list element / map value / nullable alias) that names a
type alias declared LATER in the file, vs the same program with the two declarations
swapped.  Graded on the run value against an independently computed expectation, both
runtime inputs.

Usage: genorder.py <outdir>
"""
import json, os, sys

# payload rep -> (decl-or-"", type spelling, present value, read template, expected)
PAY = [
    ("i32", "", "i32", "7", "print({E})", "7"),
    ("i64", "", "i64", "70", "print({E})", "70"),
    ("f64", "", "f64", "7.25", "print({E})", "7.25"),
    ("f32", "", "f32", "7.25", "print({E})", "7.25"),
    ("boolean", "", "boolean", "true", "print({E})", "true"),
    ("string", "", "string", '"aa"', "print({E})", "aa"),
    ("namedlit", 'type Kg = "p" | "q"', "Kg", '"p"', "print({E})", "p"),
    ("numlit", "type Ng = 1 | 2", "Ng", "1", "print({E})", "1"),
    ("struct", "type Sg = { w: i32 }", "Sg", "{ w: 5 }", "print({E}.w)", "5"),
    ("list_i32", "", "i32[]", "[1, 2]", "print({E}.length)", "2"),
    ("list_str", "", "string[]", '["a"]', "print({E}.length)", "1"),
    ("list_f64", "", "f64[]", "[1.25]", "print({E}.length)", "1"),
    ("list_ref", "type Rg = { w: i32 }", "Rg[]", "[{ w: 1 }]", "print({E}.length)", "1"),
    ("map_str", "", "{[string]: i32}", "mkG()", "print({E}.size)", "1"),
    ("closure", "", "(i32) => i32", "(x) => x + 1", "print({E}(3))", "4"),
]
MKG = """function mkG(): {[string]: i32} {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}"""

CONTAINERS = ["field", "elem", "mapval", "bare"]
ORDERS = ["fwd", "ord"]          # alias declared AFTER / BEFORE the container type
NULS = ["nulalias", "plainalias"]  # the alias carries `| null`, or does not


def build(payname, pdecl, pty, pval, rtmpl, rexp, container, order, nulk, inp):
    # a `plainalias` cell has no null to feed, so it has ONE runtime input
    if nulk == "plainalias" and inp == 1:
        return None
    if payname == "closure" and container in ("elem", "mapval"):
        return None
    tag = f"{payname[:4]}{container[:3]}{order}{nulk[:4]}"
    alias = f"Al{tag}"
    wrap = f"Wr{tag}"
    aliasdecl = f"type {alias} = {pty}" + (" | null" if nulk == "nulalias" else "")
    body = []
    lines = []
    if pdecl:
        lines.append(pdecl)
    if payname == "map_str":
        lines.append(MKG)

    if container == "field":
        containerdecl = f"type {wrap} = {{ f: {alias} }}"
        decls = ([containerdecl, aliasdecl] if order == "fwd"
                 else [aliasdecl, containerdecl])
        init = pval if inp == 0 else "null"
        body.append(f"  const w: {wrap} = {{ f: {init} }}")
        body.append("  const v = w.f")
    elif container == "elem":
        decls = [aliasdecl]
        init = pval if inp == 0 else "null"
        body.append(f"  const xs: {alias}[] = [{init}]")
        body.append("  const v = xs[0]")
    elif container == "mapval":
        decls = [aliasdecl]
        init = pval if inp == 0 else "null"
        body.append(f"  const mm: {{[string]: {alias}}} = Map()")
        body.append(f'  mm["kk"] = {init}')
        body.append('  const v = mm["kk"]')
    elif container == "bare":
        decls = [aliasdecl]
        init = pval if inp == 0 else "null"
        body.append(f"  const v: {alias} = {init}")
    else:
        return None
    # `elem`/`mapval`/`bare` have no second declaration, so `fwd` is only meaningful
    # for the struct-field container; skip the duplicate leg.
    if container != "field" and order == "fwd":
        return None

    lines += decls
    lines.append("function readerG() {")
    lines += body
    if nulk == "nulalias":
        lines.append("  if v != null {")
        lines.append("    " + rtmpl.format(E="v"))
        lines.append('  } else { print("NUL") }')
        expected = [rexp] if inp == 0 else ["NUL"]
    else:
        lines.append("  " + rtmpl.format(E="v"))
        expected = [rexp]
    lines.append("}")
    lines.append("readerG()")
    # a constant trailing line keeps the grader's value/count split honest: any real
    # difference lands in the VALUE lines, never in the count line.
    lines.append("print(1)")
    return "\n".join(lines) + "\n", expected + ["1"]


def main():
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    cells, n, skipped = {}, 0, []
    for (payname, pdecl, pty, pval, rtmpl, rexp) in PAY:
        for container in CONTAINERS:
            for order in ORDERS:
                for nulk in NULS:
                    for inp in (0, 1):
                        got = build(payname, pdecl, pty, pval, rtmpl, rexp,
                                    container, order, nulk, inp)
                        if got is None:
                            skipped.append([payname, container, order, nulk, inp])
                            continue
                        text, expected = got
                        name = f"g{n:05d}"
                        open(os.path.join(outdir, name + ".vl"), "w").write(text)
                        cells[name] = dict(leg="G", rep=payname, nul=int(nulk == "nulalias"),
                                           pos=container, con=order, read=nulk, inp=inp,
                                           spell=order, expected=expected)
                        n += 1
    json.dump(dict(cells=cells, skipped=skipped),
              open(os.path.join(outdir, "manifest.json"), "w"))
    print(f"generated {n} cells, {len(skipped)} skipped")


if __name__ == "__main__":
    main()
