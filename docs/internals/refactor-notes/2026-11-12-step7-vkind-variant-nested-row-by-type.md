# Step 7, lane H: `variantNestedRow` by type, 2026-11-12

Census 5 (`2026-11-12-step7-closing-census-5.md`) lists `variantNestedRow` (E56) in its failing
column. It returns the struct row a variant's nested-record field compares at, for the equality
emitters' comparable gates and `emitNestedShapeEq`. It had three steps:

1. Read the field's stored element name, and answer -1 when it is empty.
2. Take the stored row, `uFieldTgtStructIdx`. That function asks the field's type
   (`structIndexOfTy`, then `repRowOfTyStruct`), and on a miss runs the arm mint hook
   (`armFieldStructRowMinted`).
3. On a miss, intern the inline shape from the element name and type
   (`internInlineShapeTy`).

Step 3 is the same intern the arm mint hook in step 2 already ran on the same field.

## Probe

A scratch compiler ran over 24,070 programs (18,916 reach emit), with a control tag checked on
every program:

| reach | programs |
| --- | --- |
| step 1's empty-name guard | 0 |
| step 2's stored row (2 also found by `structIndexOfTy` alone, 1 only through `repRowOfTyStruct`) | 3 |
| step 3's intern | 0 |

## The change

Steps 1 and 3 are deleted. A field with no stored row now goes through `emitFail`, a loud floor
in place of the duplicate intern, and no program in the corpus reaches it.
`internInlineShapeTy` and `uFieldElemTyIxRow` leave `wasmEmit`'s imports.

**Measurement:** sweep (`sweep.vl diff`, master `ba36a105` against this, fixpoint seeds on both
sides): 24,196 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new
compiler traps.

## Left: `armFieldStructRowMinted` (E16)

The same probe reached the arm mint hook in one program
(`closures/closure-nullable-union-field-struct-elem-array-result.vl`). There it mints a row that
`structIndexOfTy` did not have, and the re-key of `sFieldElemName` writes back the name it
already held. The mint still keys the shape interner by the field's spelling, so converting it
waits on the interner taking a type alone, which is lane E's area.
