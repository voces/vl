# COV-CALL: a variant list whose elements legacy coerces one by one (2026-11-25)

Lane COV-CALL, class `array ref`, part (b) of the coordinator's split (2026-11-25). Part (a), a
literal over `allocLitChunk()` built chunked, waits on COV-START's chunk writer.

## Mechanism

`emitArrRef` writes a ref list through one of three short arms: plain, union box, or variant
(`arrLitVariantSlot`, which takes only `struct` / `bare` / `pass` elements). Otherwise it takes its
general path: each element through `emitArrRefElem`, which for a non-null variant's struct row is
`emitVariantCoerce` (an `if` element, say), then the same short tail when the list fits one chunk.

- **`arrLitVariantLongSlot`** (wasmEmit.vl, beside `arrLitUnionLongSlot`) names that slot. It is a
  non-null struct slot with a variant row, at most one chunk long, taken by no short arm, with no
  nested list (which legacy refuses).
- **Builder:** `arrayLit` takes it as `vslot` when the variant short arm declines, so each element
  is built by `variantElem` / `variantCoerced`, the IR's mirror of `emitVariantCoerce`.
- **Lowering:** `makeList` accepts it as the slot of `arrLitRefShortTail`.

## Census (class programs, `CENSUS_CLASS=classes/array-ref.txt`)

| row | before | after |
|---|---:|---:|
| `array ref` | 11 | 3 |

The 3 left are the chunked literals (300, 600 and 6,001 elements; part (a)). D17076 and the two
D16132 distilled cells now stop at `global store coercion`, another class. No claim falls back, and
every class program is byte-identical under `VL_IR_STRICT=1 VL_IR_SHADOW=6`.

## Proof

- **Q58 sweep:** `tests/cases/unions/variant-list-coerced-element-positions.vl` covers an `if`
  element bound, a mix with a literal and a call, an argument, a return value, an `if` with a
  `never` arm, and module scope over a narrowed union. On master the IR leaves 5 of its functions
  and the start body uncovered on `array ref`; with this change none.
- **Byte identity** against the merge-base seed (default build, equal exit codes): `tests/cases` 0
  of 9,422 differ, distilled + capability probes + witnesses 0 of 18,150, and the self-compile is
  identical.
