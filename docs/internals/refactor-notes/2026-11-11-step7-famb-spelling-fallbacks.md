# Step 7 slot layer, family B: `structRowOfSpelling` and `armFieldStructRow` graded, two dead fallbacks deleted, 2026-11-11

This is the third cut of Family B's remainder, after #7269/#7285 (`variantIndexOf`) and #7279
(`structIndexByName`). It grades the call sites of `structRowOfSpelling` (7) and
`armFieldStructRow` (4) by where the name comes from (grep counts over `compiler/*.vl`). It
probes the two sites that read a type first and fall back to a spelling. Base is master `0a9e9948`
(#7263), whose fixpoint seed is 6,623,286 bytes.

## The grading

| producer | site | where the name comes from | grade |
| --- | --- | --- | --- |
| `structRowOfSpelling` | `memberUnionFieldName` | a union member's atom, where its type is not covered | the union registry, w316 |
| | `objNestedFieldCompat` | a struct field's recorded element name | the field codes, w314 |
| | `refArrShapeKindGo`, `nameIsRefArrayGo`, `nulStructElemNiche` | a ref-array spelling | the ref-list ladder, w311 |
| | `shapeElemDeclaredStructIdx` | an inline-shape element spelling, after `repRowOfName` | the ref-list ladder, w311 (its two callers are `nameIsRefArrayGo` and `refArrElemNameGo`) |
| | `fieldRefElemName` | a field annotation's spelling, after its type's row | **deleted**: never answers |
| `armFieldStructRow` | `uFieldTgtStructIdx` | a variant field's recorded element name, after its type's rows | **deleted**: never answers |
| | `fieldCodeOfSpelling` | the field-code spelling ladder | the field codes, w314 |
| | `internInlineShapeTyGo` | a field's text during an arm's mint | the shape interner: the mint's own key |
| | `armTwinRowName` | its caller's spelling (the shape interner's two mints) | goes with the shape interner |

## The probe

The probe is #7269's (a `fambNote` per program, reported by an override at the end of
`emitProgram`, built by the base seed and never refreshed into `build/`). Each site carries a reach
tag, which is its control, and an answer tag. The sweep covered 23,922 programs.

| site | reached | the fallback answers |
| --- | --- | --- |
| `fieldRefElemName`: `structRowOfSpelling(base)` after `fieldBaseStructRow(tyIx)` | 117 | 0 |
| `fieldRefElemName`: `armTwinRowName(base)` after both | 117 | 0 |
| `uFieldTgtStructIdx`: `armFieldStructRow(nm)` after `structIndexOfTy` and `repRowOfTyStruct` | 1 | 0 |

`fieldRefElemName` now answers the row of the field's type, else the spelling's non-null base, which
it answered in all 117 programs. `uFieldTgtStructIdx` now goes from the type's rows to the mint.

`structRowOfSpelling` falls from 7 sites to 6, `armFieldStructRow` from 4 to 3, and
`armTwinRowName` from 3 to 2. Every site left is a spelling ladder or a mint, owned by the lane
named above.

## Proof

- Refresh ×2 is a fixpoint at 6,623,038 bytes (−248). Local sweep, fixpoint seeds on both sides: 23,922 same, 0 movers.
- `regress.vl`, `lint-self`, `cases_wasm`, seed size, late demands, plumb-shape cost, ladder sets,
  the dead-export budget and the memo-generation and live-sites tests pass.
