# Fix: an `if` into a nullable union-member binding (2026-11-20, lane IR6; unfiled: D17026)

`const r: A | null = if x is A { x } else { null }`, `x: A | B`, was check-clean and wrote a
module that does not validate.

## The mechanism

A scratch build that failed loudly at the binding named its pieces: the cell is `nulvariant`
(`A`'s nullable variant, `localStructIdx` its variant), and the init's `ifJoinPlanOf` is a
reference join at kind `struct`, `A`'s plain record row. `emitLetInitValue` routes only a
`variant` cell (`letArmCell`) through the variant coerce, so a `nulvariant` cell's `if` took the
plain `emitExpr` path: its `then` arm wrote the narrowed box raw into the `(ref null $A)` block,
and, had the arm been unboxed, `emitLetDelivery`'s boundary unbox would then have expected a box.

- `emitLetInitValue` writes a `nulvariant` cell's `if` initializer (`nulArmIfCell`) through
  `emitIfExprRef` at kind `variant` with the cell's variant, so the block is the variant's
  nullable row and a `null` arm the variant's own null.
- `refIfArmOf` gains `unbox`: in a `variant` join, an arm `variantCoerceArmOf` answers `box` for
  is written by `emitVariantBoxUnbox`. Before, such an arm was written raw, which never validates.
- `emitLetDelivery` treats that cell as it treats an arm cell: the init owns the unbox.
- The IR misses every `refIfArmOf` arm but `plain`, so it claims none of these.

## Witness

`tests/cases/narrowing/if-into-a-nullable-union-member-binding.vl`: the row's repro, the
un-annotated spelling (a loud emit reject before), an `else if` chain, an object-literal arm and
two record arms. It fails on master's seed and runs with the fix, in legacy and with every
function claimed by the IR.

## Lines

| | lines |
|---|---|
| compiler | +36, −4 |
