# Step 7, lane H, cut 4: a list field the descriptor declines is coded from its rep, 2026-11-12

Lane I's floor audit graded the field-code ladder's list arms as mechanism, not contract. The
ladder here is `fieldCodeOfDeclinedTy` (`emit_shape_rows.vl`), after cut 3 (#7625). It had
three list arms:

- the array arm: a tagged list is the i32 list; a scalar-element list (`scalarListRepOfTy`) is
  its wrapper; anything else is code 5;
- `tyIsNulRefList`: code 28;
- `nulScalarListFieldCode`: codes 31–36.

These arms answer for B171's lists. The descriptor's own field-code arm declines a
nullable-element list, for example `(i32|null)[]`, and leaves it to the ladder.

## Census

This reuses cut 1's probe (`2026-11-12-step7-vkind-field-code-ladder-typed.md`): a scratch
compiler, the accumulator emptied per program, 24,070 programs. At each reach of the array and
nullable-scalar-list arms it compared the arm's answer with `repOfTy(ty)`'s covered kind:

| arm | answer | the type's rep | programs |
| --- | --- | --- | --- |
| array, default | code 5 | `reflist` | 90 |
| array, scalar | strlist, list, f64list, i64list | the same | 18, 9, 2, 1 |
| nullable scalar list | nuli64list, nulstrlist | the same | 2, 1 |
| any | a list code | a different kind, or uncovered | 0 |

Every list the ladder codes has a covered list rep. That rep's list code
(`fieldCodeOfListRep`) is the code the arm gave: the ref list for a nullable element, a scalar
element's own wrapper.

## What changed

- **`fieldCodeOfDeclinedTy`'s list arms** are one read: when the field type's covered rep is a
  list or nullable-list kind, the code is `fieldCodeOfListRep` of that kind.
- **Deleted:** `scalarListRepOfTy`, `nulScalarListFieldCode` and `tyIsNulRefList`. The ladder
  keeps the union-box arms.

## Measurement

- **Sweep** (`sweep.vl diff`, master `46ebbb50` against this, fixpoint seeds on both sides):
  24,189 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler
  traps.
- **Seed:** 6,720,449 → 6,720,084 bytes (−365), a fixpoint.

## The other four dependencies lane I named

`fieldRowKind`'s code floor, the order stash's `200 + code`, `sFieldStoreKind`'s code floor and
`fieldCodeCellKind` are each one question asked four ways. Which field rows have no covered
storage rep? A probe at `rowStoreRepIn`, the shared reader, over the same population:

| storage type | programs |
| --- | --- |
| the `null` type (rep `nulnone`) | 179 |
| a type parameter (uncovered) | 40 |
| `T[] \| null` with an unresolved element (uncovered) | 4 |
| no type recorded | 0 |

- **`nulnone`:** every storage type that reps as `nulnone` is the `null` type itself. The code
  floor's premise was that a hole's record also reps `nulnone`, so only the code tells the two
  apart. No program has that case. The next cut answers `nulnone` from the type.
- **Uncovered:** the type-parameter and unresolved-element rows are graded next.
