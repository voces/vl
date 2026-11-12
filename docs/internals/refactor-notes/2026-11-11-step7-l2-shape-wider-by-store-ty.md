# Step 7 L2 §7: the wider-row reuse compares a ref field's storage type, not its spelling, 2026-11-11

This is the second of lane w309's two name compares in `emit_shape_intern.vl`. The first, the
dedup in `annShapeIndexOf`, is `2026-11-11-step7-l2-shape-dedup-by-store-ty.md`. This one is in
`annShapeWiderRowOf`: an annotation reuses the wider `#anon` row a literal already interned
(D831) only when every field with the row's own code records the same element name. It now
compares the two storage types (`sFieldStoreTy` against `recFieldStoreTyOf`), and keeps the
name compare for a field with no recorded type.

The base is the dedup PR, stacked on #7219. The population is the cases population.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the predicates
note's accumulator, against the #7219 tree. The compare is reached in 94 programs, and the name
and the type disagree in 57. In 18 of those, at least one disagreement has the names agreeing
while the types differ. In the other disagreements the names differ while the types agree.

Most disagreements are on a declared or arm element name, such as `Inner`, `A`, `O`, `T` or an
`#anon` row. A reuse also needs a boxed union field, so this compare decides little on its own.

## Changed

- `annShapeWiderRowOf`: the storage types decide when both rows record one.

## Proof

- **Targeted.** The 96 programs that reach the compare were each built with the dedup PR's seed
  and with this candidate: 0 exit codes differ and 0 modules differ in bytes. Because the reuse
  also needs a boxed field, no disagreement changed a reuse in the corpus.
- **Local.** One refresh; `cases_wasm` 7,440 passed, 0 failed; `rep-fuzz-check.sh` is exact.
  Distilled `regress.vl`, `check-filed-witnesses --strict`, lint-self and the static budgets
  are listed in the PR.
