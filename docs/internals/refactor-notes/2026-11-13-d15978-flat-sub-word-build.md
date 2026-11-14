# D15978 build: a `flat` record's sub-word field has storage semantics (2026-11-13)

This builds the plan in `2026-11-13-d15978-flat-sub-word-plan.md` (#7854) for the owner's ruling
(a): a `u8`/`i8`/`u16`/`i16` field of a `flat` record stores the low bits of a computed value
at its width, refuses a visibly out-of-range literal at that width, and reads back widened to
`i32`. It closes D15978, D16044 (clause 1) and D16045, and deletes `flatHasSubWordField`, the
row's carried name reader.

## Checker

- **Arena:** `TY_I8`, `TY_U16` and `TY_I16` beside `TY_U8`, as `PrimName` members, seeded after
  `v128` so no earlier index moves. Every exhaustive prim-name match that had a `u8` arm (29 of them)
  gives the three the same arm, since all four are storage widths. The exception is
  `flatScalarWidth`, which now answers 1 and 2.
- **The field's type is its width:** `subWordTyOfName` resolves a `flat` field's leaf spelling
  (the carve-out beside `u8[]`'s), and the layout reads the width from the type.
  `flatStorageSpellWidth` and the placeholder `TY_U8` are gone.
- **Literal range at the field's width** (`assignableSubWordSlot`, formerly `assignableU8Slot`).
  `u8` keeps its sentences; the other widths name themselves and their range.
- **A read widens:** a member read of a sub-word field is `i32` (`arrElemValueTy`, as a `u8[]`
  element read).
- **A value position refuses every width as a storage type**, as it already refused `u8`. That
  includes `i16[]`, D16043's phase-2 list element.

## Emitter: packed struct fields

- `flatHasSubWordField` is deleted, so a `flat` record with a sub-word field mints its declared
  struct row. Its field code is `FC_I32`, because the operand and the read are `i32`.
- `mAssignPackedFields` records each struct row's sub-word fields once the heap indices are
  assigned. `tsStruct` writes them as packed storage, `i8` (0x78) or `i16` (0x77).
- `fbStructGet`, the one writer of `struct.get`, emits `struct.get_s` for `i8`/`i16` and
  `struct.get_u` for `u8`/`u16` at a packed field. So no read site can miss the widening, and a
  store truncates by itself.

## Measured

- **Position matrices** `flat-sub-word-{u8,i8,u16,i16}`, master `1323b99e` → this branch:
  - `u8`: 2 → 78 of 78 runs;
  - `i8`: 0 of 80 → 78 of 78 (the out-of-range literal is now an owed refusal);
  - `u16`: 0 → 78 of 78;
  - `i16`: 0 → 78 of 78;
  - 0 silent, 0 runs → not-runs.
- **Witnesses `--strict`:** D15978 and D16045 move to runs, D16044 to a check reject, and
  `flat-sub-word-widths.vl` (layout and intrinsics) is unchanged. 0 output mismatches.
- **Control:** `tests/cases/memory/flat-sub-word-storage.vl` covers each width with a computed
  store, a field assignment, a signed read and a literal. Master refuses it.
