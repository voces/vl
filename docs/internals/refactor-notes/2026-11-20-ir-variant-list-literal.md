# IR: a list literal of a non-null variant's records (2026-11-20, lane IR-N3)

`array ref` was the IR builder's refusal of a ref-list literal at a slot neither of legacy's
short arms takes (`arrLitRefPlainSlot`, `arrLitUnionBoxSlot`). Every site of it on the
self-compile and the distilled corpus was one shape: a literal at a ref-list slot whose element
is a union variant's record row, not nullable (`Tok[]`, `Circle[]`). The plain arm refuses that
row because legacy coerces each element into the arm (`emitArrRefElem`'s `emitVariantCoerce`).

## The change

- **Empty literal.** With no element to coerce, legacy writes the backing and wrapper alone on
  both arms, so `arrLitRefPlainSlot` refuses the variant row only when the list has elements.
- **Non-empty literal.** `arrLitVariantSlot` (`emit_plan_union.vl`) is the slot of a short literal
  at a non-null variant row whose every element enters the arm as `variantCoerceArmOf`'s
  `struct` (an object literal) or `bare`/`pass` (a value of the variant that owes no recover).
  Legacy's `emitArrRef` takes it as its own arm, ahead of the generic loop it equals there, so it
  is one shared decision, not a mirror. The builder builds a literal element at the variant's
  row (`objLitAt`, as a map store's variant literal is) and any other as it stands; the lowering
  writes `arrLitRefShortTail` at that slot.

## Witness

`tests/cases/arrays/variant-row-list-literal.vl` (un-annotated where inference allows) and its
shadow row: three functions are `array ref` under the merge-base seed, and all four are covered
and matched after.

## Measured

On fixpoint seeds, merge-base 6851d881 against this branch. `array ref` is 0 on both the
self-compile and the corpus. Every corpus cell that held it is covered = matched under the armed
shadow, with mode 3 and the armed A/B byte-identical.
