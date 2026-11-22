# IR coverage: function-value compares on legacy's `closure` route (2026-11-22, lane IR-N8)

A route of `operand type`: a compare `eqRouteOf` answers `closure` for (identity over two
closures: the same lifted function and the same captured env).

## Design

- **Tail (`wasmEmit.vl`).** `emitClosureEq` writes each operand and its narrowed recovery, then
  `closureEqTail`: `emitEqNonNullCore` and `i32.eqz` for `!=`.
- **`RClosureEq { cqL, cqR, cqAt }`**, routed where `eqRouteOf` answers `closure`. Both operands
  are built as values; one legacy recovers after its read (`eqOperandRecovers`) is the named miss
  `function compare recovered operand`, so the recovery stays legacy's. The verifier holds both
  operands at closure reps and the answer a bool. Family `other`.

## Measured

Against master 5f8d0483's fixpoint seed:
- `tests/cases` covered = verified 68,381 → 68,399 (+18), matched 68,380 → 68,398; corpus
  unchanged at 45,076;
- `ir-identity --cases`, `--claimless` and `--names` differ 0; the legacy A/B differs 0;
- L2 fuel +0.13% per PR, source growth: the head seed compiles the base tree within +0.001% of
  the base seed's fuel.

The row `tests/ir-shadow-rows/closure-identity-eq.vl` has 7 functions; 3 miss on master's seed,
and here all 7 are covered and matched.
