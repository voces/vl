# Producer slice N3: `for` elements, path lack and `const` copies, 2026-11-16

Lane STORE, the N step's third producer slice (coordinator's order N1 → N2 → N3). Stacked on N2.

## What changes in the set-binding producer (`check_set_bind.vl`)

- **A `for` loop's element is an element step** in the path-call search (`sbForElemIter`):
  `for x in xs { x(3) }` and `for e in a { e.f(3) }` reach `xs`'s and `a`'s sets at `[]`.
- **A path call's lack is the path's own.** A path place was marked partial when any row handed the
  parameter a value of no set as a whole (`sbRowsLackSet`), which a list or record argument always
  is. The place's set is the argument type's at the path, so only that type lacking one (`lack`)
  makes the place partial.
- **A `const` copy of a parameter is that parameter** (`sbCopyRoot`): `const hh = h` read inside a
  nested function hands on `h`'s sets.
- **A call through any name the check types at a set hands its arguments to each member**
  (`sbThroughNote`), a `for` loop's element over a written or pushed list included, as a `const`
  of a set already did: `for f in fs2 { f(snd) }` brings `{snd}` to `apply2`'s and `apply3`'s
  parameters.

## Measurement

ftlate probe, all `@run` programs, fixpoint seeds, against N2:

| | N2 | N3 |
|---|---|---|
| programs whose decision the late pass changes | 276 | 262 |
| N sets / programs | 165 / 82 | 138 / 69 |
| P sets / programs | 123 / 70 | 45 / 30 |
| T sets / programs | 96 / 54 | 158 / 86 |
| late drops | 2 | 2 (the same pair) |

The path-lack change moves most of the P residue to T: those sets were refused by a lack test that
read the whole argument, not by an instance fact. They are now tried at check and refused there.

## The `for` shape: found, and refused by the holder plan (next slice, after D16829)

`for x in xs { x(3) }` over a list parameter now reaches `xs`'s set at `[]`, and the set is in the
list's type, so it keys the instance. The check refuses it in `ftScan`, at `ftHoldCtxOk`'s call
arm, for the literal `[inc0, half]` handed straight to `direct(xs)`. That arm admits a holder
handed to a hole parameter through `ftDstTakes(ftArgDstTy(...))`, which reads the parameter's
type at the call: the instance's after the elaboration, the hole at check. Or it admits it
through `ftHandedHolder`, which takes a named binding, not a literal.

The fix's shape: in the check's retry, `ftArgDstTy` reads the call's binding of the hole
parameter, so a literal handed there binds it to the literal's own type. It is graded under the
retry with the probe and a control. It waits for AE4's D16829 holder edits to settle
`ftHoldCtxOk` (coordinator, 2026-11-16).

## Grading

- A/B, fixpoint against master's fixpoint: wasm and output byte-identical on all `@run` programs.
- The late-outside-exclusions probe fires on none.
