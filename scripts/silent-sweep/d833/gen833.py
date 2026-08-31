#!/usr/bin/env python3
"""THE COMPETING-ROW GRID (D831/D833) — a `??`-joined pair of same-fieldset object
literals, and the axis is WHAT ELSE IN THE PROGRAM NAMES THE SAME FIELD SET.

    python3 gen833.py <outdir>            # write the cells
    python3 gen833.py --verify <outdir>   # regenerate and assert byte-identity

WHY IT HAD TO BE BUILT. D804 closed "two `??`-joined literals that disagree at a LEAF
field need the merged ROW" by MINTING that row — and every rung of that mint is gated on
`structIndexOfObj(ow) < 0`, i.e. on the literal having matched no row at all. D804b was
filed as the residue under the headline "a map that ROUND-TRIPS THROUGH A GENERIC loses
the merged value row". That headline is a coincidence of the corpus cell's spelling. The
generic is one of FOUR ways to put a competing same-fieldset row in the program, and the
plainest is a THREE-LINE `type R = { r: i32 }` that the program never uses.

The grid crosses:

  CARRIER    how the competing row gets into the program —
             `none`     nothing else names `{r}`; D804's own control
             `alias`    `type R = { r: <ft> }`, declared and NEVER USED
             `paramann` `function sink(_x: {r: <ft>})`, declared and never called
             `mapann`   `function sink(_x: {[string]: {r: <ft>}})`
             `genpin`   no source annotation at all — the row is minted by the
                        MONOMORPHIZER's pin for `reverse([c])[0]`, POST-`monomorphize`,
                        after the literals have already interned their merged row
  FIELDTY    the competing row's field type — `i32`, `string`, `i32 | null`
  DEFAULT    the `?? { r: <v> }` default's field value — `null`, `"s"`, `1.5`, `9`

TWO MECHANISMS, ONE MESSAGE, AND THE ABLATION IS WHAT SEPARATES THEM. Both print
`emitProgram: bare null needs a struct-typed context` at the null corner:

  `genpin`  the merged row IS minted (`collectAnonShapes` runs pre-`monomorphize` and
            answers), and then the instance's pinned annotation mints a NARROWER twin
            that the local's cell, the map value slot and the delivery seed all name.
            **Closed by D831** — `annShapeWiderRowOf`.
  the other three  the competing row exists BEFORE `collectAnonShapes`, so both literals
            match it and the merge never runs at all. **Open, filed as D833.**

A probe build put the split beyond argument: instrumented at each gate, the generic cell
answers `M L Y S` (mint, leaf rung reached, leaf rung ANSWERS, sibling then matches the
minted row) and the alias cell answers `S S` (both literals matched a row, the rung never
called).

HALF THE OPEN CELLS ARE CHECK-CLEAN INVALID WASM, not loud — six of the twelve. With a
`string` default `anonValueFitsField` refutes, each literal gets its OWN row, and the `??`
then has to join two heap types. D804's row predicted three such cells; this grid finds six,
and they are clause-1 cells the corpus had no program for.
"""
import os
import sys

CARRIERS = ("none", "alias", "paramann", "mapann", "genpin")
FIELDTY = {"i32": "i32", "str": "string", "nul": "i32 | null"}
DEFVAL = {"null": "null", "str": '"s"', "f64": "1.5", "i32": "9"}


def prog(carrier, ft, dv):
    src = ""
    if carrier == "genpin":
        src += 'import { reverse } from "std:array"\n'
    elif carrier == "alias":
        src += "type R = { r: %s }\n" % FIELDTY[ft]
    elif carrier == "paramann":
        src += "function sink(_x: {r: %s}) { print(1) }\n" % FIELDTY[ft]
    elif carrier == "mapann":
        src += "function sink(_x: {[string]: {r: %s}}) { print(1) }\n" % FIELDTY[ft]
    src += "function rd() {\n"
    src += "  const c = Map()\n"
    src += '  c["k1"] = { r: 7 }\n'
    if carrier == "genpin":
        src += "  const dd = reverse([c])[0]\n"
        src += '  const g1 = (dd)["k0"] ?? { r: %s }\n' % DEFVAL[dv]
    else:
        src += '  const g1 = (c)["k0"] ?? { r: %s }\n' % DEFVAL[dv]
    src += "  print(0)\n"
    src += "}\n"
    src += "rd()\n"
    return src


def cells():
    """The named set: every cell of the grid whose CARRIER row is load-bearing.

    `none` (4) is D804's control — nothing else names `{r}`, all four run, and they are
    what says the merge itself still works. `genpin` (4) is D831's own witness set — three
    of the four move here and all four must keep running. The other twelve are D833's
    standing price and are OPEN — twelve cells no corpus
    cell reached before this grid: six loud `bare null needs a struct-typed context` and six
    check-clean invalid modules. `genpin` and `none` vary only the DEFAULT (their competing
    row's field type is not a free axis); the three source carriers vary both.
    """
    out = {}
    for dv in DEFVAL:
        out["d833_none_i32_" + dv] = prog("none", "i32", dv)
        out["d833_genpin_i32_" + dv] = prog("genpin", "i32", dv)
    for carrier in ("alias", "paramann", "mapann"):
        for ft in ("i32", "str"):
            for dv in ("null", "str"):
                out["d833_%s_%s_%s" % (carrier, ft, dv)] = prog(carrier, ft, dv)
    return out


def main():
    args = [a for a in sys.argv[1:] if a != "--verify"]
    verify = "--verify" in sys.argv
    if not args:
        print(__doc__.strip())
        return 2
    outdir = args[0]
    os.makedirs(outdir, exist_ok=True)
    for name, src in sorted(cells().items()):
        path = os.path.join(outdir, name + ".vl")
        if verify:
            have = open(path).read()
            if have != src:
                print("MISMATCH %s" % name)
                return 1
        else:
            with open(path, "w") as fh:
                fh.write(src)
    print("%s %d cells in %s" % ("verified" if verify else "wrote", len(cells()), outdir))
    return 0


if __name__ == "__main__":
    sys.exit(main())
