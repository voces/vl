# Step 7 slot layer, family B: the banked spellings measured, 2026-11-11

This is the census's item 3, the banked spellings (`2026-11-11-step7-famb-decl-identity-census.md`
§2, 689 programs on `98b73ba7`). It measures what a type read would lose at each banked site that
is in this lane. Nothing in the compiler changes. Base is master `6c985ea7` (#7161), with #7165.

## Which sites are in this lane

| census site | owner |
| --- | --- |
| `rlElemStructRow`, `rlElemVariantRow`, `refArrElemNameGo`, `nameIsRefArrayGo` (`emit_shape_rows`) | w311, the ref-list sites |
| `mvShapeOfValNameArmTyGo` (`emit_union_atoms`) | w309, the mv/rl codecs |
| `armsHoldHeap` (`wasmEmit`) | its atoms come from `unionArmsOfTy`, the union registry (w316) |
| `rlElemVariantHeap` (`emit_collect`), `rlElemLitStructRow` (`emit_map_value_slots`) | measured here |

## Method

The probe compiler was built from base plus the probe and never refreshed into `build/`. It
tagged each program once, at the end of `emitProgram`, overriding any earlier emit error:

- **`.twin`**: the site reads a declared name whose type a second declared record shares
  (`tySame`).
- **R1.diff**: `rlElemVariantHeap`'s name row `variantIndexOf(rlElemName[slot])` differs from
  the type's, `repVariantShapeRowOf(rlElemNonNulTyAt(slot))`.
- **R2.diff**: `rlElemLitStructRow`'s name rung answers, and its row differs from the
  type's canonical row, `repRowOfTyStruct`.
- **R3**: `armsHoldHeap` reads an arm atom with such a twin. It is counted, not converted.

The control was an arm list `Circle[]` beside a same-shape standalone `CircleC`, and it fired
`R3.twin:Circle`. The sweep covered 23,900 programs. Counts are **programs**, by origin:

| tag | programs | origin |
| --- | --- | --- |
| R1.twin | 861 | distilled cells 524, distilled named 286, … |
| **R1.diff** | **69** | distilled named 50, cells 19; every one also R1.twin, every name `Circle` |
| R2.twin | 153 | distilled named 101, … |
| **R2.diff** | **502** | distilled named 317, docs 60, cases/unions 57, …; 136 of them twins |
| R3.twin | 393 | distilled named 135, cells 196, cases/unions 25, … |

Every one of the 1,323 tagged programs runs on base.

## Grading

- **R1: the banked spelling is the declaration, and the type cannot replace it.** The 69 are
  ARM2. `Circle` is an arm of `Shape`, and a same-type `Dot` is an arm of `DotU`
  (`distilled/cells/a102752.vl`). The element was spelled `Circle`, so the name answers
  `Circle`'s row and its heap. The type answers another union's arm. A type read would move
  69 running programs onto the wrong heap.
- **R2 is the struct-row-by-name class**, the one `retStructRowIndex` is in
  (`2026-11-10-step7-retkind-family.md`). A declared record's row is minted under its name.
  The canonical row of its type is often a same-shape twin's, or an anonymous literal's.
  These reads stay by name until struct rows key by canonical type.
- **The conversion is a bank conversion, not a column read.** `rlInternNameTy` mints from a
  name, so a declaration column written at the mint would be `recDeclPosOf(stored, rlTy)`.
  That is the name read back, and it removes nothing. To remove the name, every mint
  caller has to pass the declaration it resolved, an annotation's `annDeclPos` or a
  value's. That is the ref-list bank's own conversion, the w309/w311 rl work. Until it lands,
  the name stands, because it is today's only declaration identity on that bank.
- **R3 is by design.** The atoms are the union declaration's own member names, which the
  census grades as the identity itself.

## What is left of Family B in this lane

- `structIndexOfExpr`: its syntax side becomes a typed read, or is graded by design.
- The shape-row scan (`shapeRowScanK` → `shapeFieldTypeCompatK`).
