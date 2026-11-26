# IR: an `is` test of a record field at storage, any receiver (cov-is-52)

Lane COV-IS, 2026-11-26. Regen-10 row `is stored member receiver`.

## Change

- `storedBoxTest` (`compiler/ir_build.vl`) claimed a stored member `is` test only when the receiver
  was a local of the claimed function; a global or captured receiver missed with
  `is stored member receiver`. It now claims any `Member` receiver through `storedMemberBoxTest`.
- `getField` (`compiler/ir_lower.vl`) lowers a `gfStored` read through `fieldTailAt(.., true)`,
  which skips the union unbox (`variantUnionBoxTail` / `structUnionBoxTail`) a narrowed read takes.
  A box read at its storage is the box; a write's narrowing does not unbox it.

## Defect closed

D17675 (the field analogue of D17663's map cell): a field written in an `is` branch, then tested
for the member the write left, lowered the stored read with the write's unbox, so the claim of the
function was invalid wasm (`expected (ref null $union box), found i32`) under `VL_IR_STRICT=1`.
Pre-existing for local receivers, reached for globals and captures by the widened claim.

## Measurements

- Pin `tests/cases/soundness/field-rewritten-is-at-storage-positions.vl`: parameter, local,
  top-level and captured receivers. Master seed under `VL_IR_STRICT=1`: invalid module in `param`.
  This branch: prints the `@log` lines, strict and require-claim clean.
- `check-filed-witnesses.vl --strict` on D17675: 1 output-checked, 0 mismatch.
