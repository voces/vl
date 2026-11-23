# IR: a nullable record field's value (2026-11-20)

`object field armDelivery` held 14 self-compile functions alone (19 with a second blocker) and
137 corpus functions. In each, an object literal writes a field of kind `nulstruct` or
`nulvariant` (a `Pt | null` or `O | null` record field) that is not a literal union.

## Mechanism

- Legacy writes that field with `emitArmDelivery`: `armOpen`, `emitExpr`, then `armClose`.
  When `narrowedArmNeedsUnbox(valIx, fnIx)` is false, `armOpen` leaves the seat alone and
  `armClose` returns 0, so the write is the value's `emitExpr` alone.
- The IR's `fieldPlainWhy` now admits `armDelivery` under that same predicate, asked as is. The
  value goes through the existing `deliver` and is rep-checked against the field's rep.
- An owed unbox is a named miss, `object field arm unbox`, the same pattern as
  `map store value unbox` and `global initializer arm unbox`. The IR gains no unbox op.

## Witnesses

`tests/cases/records/nullable-record-field-takes-its-value.vl` and `vl_ir_shadow_test`. Each
function is matched or named:

- Built and matched (4): a nullable parameter into a `Pt | null` field and into an `O | null`
  field (`O` an arm of `U`), across a self-referencing row; and a narrowed local.
- Named miss `arm unbox` (2): a `Pt` narrowed out of `Pt | i32`, and an `O` narrowed out of `U`.
- Named miss `explicitNull` (2): an explicit `null` into each field.

## Readings

Measured against a fixpoint at the merge-base de317fa31 (6,926,454 bytes). The candidate is also a
fixpoint (6,926,540 bytes).

- Self-compile `object field armDelivery` 14 → 0, `arm unbox` 0. Functions with no blocker
  19,018 → 19,031 (+13); covered and matched 19,017 → 19,030.
- Corpus functions with no blocker 41,774 → 41,885 (+111). `object field armDelivery` 137 → 0;
  no corpus function owes the unbox.
- `tests/cases` A/B: 7,261 same, 0 differ. Corpus `ir-identity --names`: 9,037 identical,
  0 differ; self-compile identical. `--cases`: 7,541 identical, 0 differ. Witnesses: 59 same.
  Mode-3 self-compile identical.
- L2 self-compile fuel 104,598,529,665 → 104,595,455,262 (−0.003%). Late demands 9 of 9; late tag
  rows 307 of 307; phase-state ok.
