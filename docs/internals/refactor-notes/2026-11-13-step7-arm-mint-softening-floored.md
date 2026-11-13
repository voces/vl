# The arm mint's literal-union softening is a floor; `internArmShapeRow`'s render, graded, 2026-11-13

Lane A, `internArmShapeRow`'s render (released by lane F; the render itself waits on lane E's
step (d)). Emit only.

**The change.** `armMintShapeName` (D1093) rewrote an inline literal-union field of the arm's
render to `string`, so the arm row coded the field as the variant recorder does. On master it never
rewrote a spelling in the sweep population. It is deleted. An arm type with an inline literal-union
field is a loud floor, checked on the type (`armHasInlineLitUnionField`) rather than on the
rendered spelling.

**The render, graded** (probe, master, the full sweep population: 7,205 arm mints). This is the
table the post-(d) cut is built on.

| `nm` from | the mint's row is | sites |
|---|---|---|
| `armMintRenderOf` (declared field names) | an existing row by that name | 66 |
| | the row `repStructRowOfTy(aty)` gives, before / after the mint | 10 / 38 |
| `tyToEmitName(aty)` | an existing row by that name | 4,113 |
| | the row `repStructRowOfTy(aty)` gives, before / after | 6 / 2,960 |
| | none | 5 |
| | a row the type lookup disagrees with | 7 (5 programs) |

The render cannot go before step (d). `internInlineShapeFieldsTy(nm, -1, aty)` still splits the
fields out of `nm`, and about 4,100 mints deduplicate onto an existing row by that spelling.

**The 7 disagreements, ablated.** In every one the mint deduplicates by its rendered spelling onto
another declared type's row, while `repStructRowOfTy(aty)` gives the arm type's own reference row:
- **Storage-widened twin** (3 programs: `soundness/is-containing-record-always-fits`,
  `unions/layout-family-literal-set-beside-string`, `unions/union-variant-field-reps-equality`).
  The arm's field type differs from the other record's but is stored the same, and the render
  widens it: `1 | 2` as `i32`, a literal union `K` as `string`, `boolean[]` as `i32[]`. Minimal
  witness:

      type A = { x: i32 }
      type B = { x: 1 | 2 }
      type C = { z: string }
      function f(b: B | C) { if b is A { return b.x }; 0 }
      print(f({ x: 2 }))

- **Structural twin** (2 programs: `unions/arms-name-one-record-shape-twice`,
  `generics/alias-to-generic-application-field-positions`). Two declared records with identical
  field types (`A`/`NA`, `Cat`/`OptHolder`) share the first-declared row. No row key needs
  declaration identity (#7306), so this is by design.

Neither class is a row bug: all 5 programs run and print as filed. After step (d), a type-keyed
dedupe (`repStructRowOfTy`) would split these twins onto their own reference rows. Whether a
storage-widened twin keeps sharing its row is the decision that cut has to make, and its sweep
grades it.

**Sweep** (master fixpoint seed vs candidate, same tree): 24,205 same, 0 bytes-only movers, 0
output movers, 0 runs → not-runs, 0 new traps.
