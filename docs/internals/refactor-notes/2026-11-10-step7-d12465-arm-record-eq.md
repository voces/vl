# Step 7 Closes: D12465, an arm compared with a same-shape record, 2026-11-10

From the Closes list in `2026-11-10-step7-closing-census.md`. The base is master `e131211a`, with a
fixpoint seed (two `refresh-compiler.sh` runs byte-identical).

## Why the pair refused

`==` over records asks `binEqVariantRow` and then `binEqStructRow`. A `Circle` operand (a
declared union arm) answers a variant row and no struct row, because `structIndexOfRep` declines
a variant rep. A `Dot2` operand (the same shape, declared outside the union) answers a struct row
and no variant row. Neither resolver saw both sides, so the pair fell to
`emitProgram: struct equality is not supported yet`.

On this witness the two values sit at the same heap type. `variantHeap(vi)` is
`sHeapIdx[variantRowOf(vi)]`, and the disassembly stores both `a` and `d` as `(ref $2)`. So
under step 7's ruling, one row per canonical type, the arm already has a struct row: the row
its values are stored at.

## Change

`binEqStructRow` reads each operand through `binEqSideRow`. That is the operand's own struct
row, else `variantRowOf` of its variant row. The existing D959 heap-agreement test then decides.
If the arm and the record are stored at different heap types, the pair still reaches the
refusal. One function was added and nothing else changed. The frame-reservation scan
(`exprIsStructEq`) reads the same resolver, so the scan and the emitter cannot disagree.

## Graded cells (hand matrix, one program per cell, on the candidate seed)

| cell | prints | want |
| --- | --- | --- |
| `a == d` in a function, both orders | `true` / `false` | yes |
| `a != d`, both orders | `true` / `false` | yes |
| top-level globals, `==` and `!=` | `true false` | yes |
| parameters `(a: Circle, d: Dot2)` | `true false` | yes |
| a `Circle[]` element against a `Dot2` and the reverse, and a `Dot2[]` element | `false true false` | yes |
| record fields `h.c` (`Circle`) against `k.c` (`Dot2`), and a field against a local | `false true true` | yes |
| records holding each (`{a: Circle, n: string}` against `{a: Dot2, n: string}`) | `true false` | yes |
| a string-field arm against its record twin | `true false` | yes |
| an arm against an arm of another union with the same shape | `true false` | yes |
| a narrowed `s is Circle` against a `Dot2` | `true false` | yes |
| the result of `(): Circle` against the result of `(): Dot2` | `true` | yes |
| a nullable `Circle \| null` narrowed by `!= null` | `true` | yes |

The fixture `tests/cases/unions/error-arm-struct-equality-mixed.vl` keeps its path, because the
row and D57 and D959 cite it. It changes from `@emit-error` to `@run` and pins nine of these cells.

## Rows

- D12465 is closed, and its witness prints `true`.
- D1191 is closed (a UFCS name leak) and is not about same-shape records. Only a keyword
  matched it.
- D4883 is a check reject on a generic `if` list join. It is not about records either.
- The "65 same-shape cells" figure has no committed coordinate set, so it is not graded here.

## Proof run locally

These passed: refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
dead-export, render-parse, emitter-state audit, cases_wasm 0–3 (7,514 passed), inventory
refs/rows, the pin-helper budget, `vl_scaling_shape`, `vl_probe_rollback`, and
`check-filed-witnesses --strict` on both inventories (4,691 as filed, 0 moved; D12465 `runs`).
