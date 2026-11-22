# IR coverage: `==`/`!=` over a union of records on legacy's `unionUnion` route (2026-11-22, lane IR-N8)

A route of `operand type`. On master 5f8d0483, a census with a throwaway seed that names
`eqRouteOf`'s answer in the miss put 3 `tests/cases` functions on `unionUnion`, all of them a
union of declared shapes compared with itself (D973's struct union compare), which the IR's hook
(`unionUnionEqStagedOf`) leaves out.

## Design

- **Plan and tail (`wasmEmit.vl`).** `emitUnionUnionEq` writes both operands, then
  `unionUnionBoxesTail`, which matches on `unionUnionEqArmOf`: `struct` (one union of declared
  shapes whose arms `unionBoxEqColumns` serves) writes the box compare over those columns,
  `staged` the staged compare. `emitStructUnionEq`, the old struct-first writer, is gone; its
  columns are now asked after the operands, which mint nothing.
- **The hook (`unionEqOf`)** also admits `eqRouteOf`'s `unionUnion` over two named operands on
  the `struct` arm, through legacy's own functions. The lowering writes `unionUnionBoxesTail`.
- **`unionEqSide`.** A union compare operand that is a local legacy reads as its box
  (`exprUnion`) and is not captured is its box variable, past the narrowing its type carries.

## Measured

Against master 5f8d0483's fixpoint seed:
- `tests/cases` covered = verified 68,381 → 68,384, matched 68,380 → 68,383; corpus unchanged at
  45,076;
- `ir-identity --cases`, `--claimless` and `--names` differ 0;
- L2 fuel per PR +0.01%.

The row `tests/ir-shadow-rows/union-struct-eq.vl` has 5 functions, all `operand type` on master's
seed, all covered and matched here.
