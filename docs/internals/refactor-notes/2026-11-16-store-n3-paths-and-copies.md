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

## Measurement

ftlate probe, all `@run` programs, fixpoint seeds, against N2:

| | N2 | N3 |
|---|---|---|
| programs whose decision the late pass changes | 276 | 264 |
| N sets / programs | 165 / 82 | 141 / 71 |
| P sets / programs | 123 / 70 | 41 / 28 |
| T sets / programs | 96 / 54 | 164 / 88 |
| late drops | 2 | 2 (the same pair) |

The path-lack change moves most of the P residue to T: those sets were refused by a lack test that
read the whole argument, not by an instance fact. They are now tried at check and refused there;
the first refusal measured is the holder plan's (`ftHoldCtxOk`'s call arm), for a literal list
handed straight to a hole parameter. That is the next slice.

## Grading

- A/B, fixpoint against master's fixpoint: wasm and output byte-identical on all `@run` programs.
- The late-outside-exclusions probe fires on none.
