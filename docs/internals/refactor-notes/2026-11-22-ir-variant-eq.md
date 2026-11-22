# IR coverage: `==`/`!=` over records on legacy's `variantEq` route (2026-11-22, lane IR-N8)

The fifth route of `operand type`, stacked on `structEq` (#9503). `eqRouteOf` answers `variantEq`
when both operands resolve to one variant of a union of records (`binEqVariantRow`); legacy writes
it with `emitStructEq` over that variant's eq row.

## Design

- `variantEqRowOf(binIx, fnIx)` (`wasmEmit.vl`) is the row, `eqRowOfVariant(binEqVariantRow(…))`,
  split out of `emitEqRoute`'s `variantEq` arm, which now calls it.
- `RStructEq` gains `seRow`: the builder records the route's row (`binEqStructRow` or
  `variantEqRowOf`) and the lowering reads it, instead of re-asking `binEqStructRow`. A variant
  row is negative; `structEqSlot` already maps it to its arm slot.
- Staging, roots and tails are #9503's; nothing new is admitted.

## Measured

Against `vl-queue/BA5` (d63c2df9, which holds #9503) at its fixpoint seed:
- `tests/cases` covered = verified 68,449 → 68,462 (+13), matched 68,448 → 68,461; corpus
  45,093 → 45,095 (+2);
- `ir-identity --cases`, `--claimless` and `--names` differ 0; the legacy A/B differs 0;
- L2 fuel per PR -0.00%.

Open: `if s is Circle { s == c }` over a narrowed `Shape` parameter is still `operand type`; it
does not reach this route's builder.

The row `tests/ir-shadow-rows/record-variant-eq.vl` has 6 functions; 4 are `operand type` on the
base seed, and here all 6 are covered and matched.
