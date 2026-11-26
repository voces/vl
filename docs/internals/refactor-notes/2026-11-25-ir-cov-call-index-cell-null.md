# COV-CALL: a shared cell's read narrowed to `null` (2026-11-25)

Lane COV-CALL; census class `index cell null` (`classes/index-cell-null.txt`).

## Mechanism

A captured `let x = null`, read inside a callback before the write that fills it, is read through
its shared cell: an `Index` respelling the name (`c[0]`), narrowed to `null`. Legacy's
`emitIndex` asks `idxCellReadIsNull` first. When the destination holds a null of its own
(`nullReadDstOwnOf`), it writes that null instead of the read (`emitNullReadAtDst`), and the
read's element-read row still spans it (`emitIndexBanked`). The IR's list read refused every such
read (`listIdxPlainWhy`: "index cell null").

The builder's `nullReadOwnAt` decides a name read narrowed to `null` for `deliver`, and it now
answers for the cell read too. The delivery then builds the same `RNullOf` at the destination as
for a name. The lowering banks the read's row over that null when `nuAt` is an `Index`, so the
spans match legacy's: the shadow reds a spans mismatch even when it is listed. Where the storage
read is the null (`nullReadDstOwnOf` -1), legacy writes its plain arm, so `listIdxPlainWhy` now
refuses only the other case.

A first cut built the null in `buildIndex` at the read's own rep, the `null` unit. A sentinel
destination (`boolean | null`, a literal union) then missed on `argument coercion`, so the
decision moved into the delivery, where the destination's rep is known.

## Proof

- **Census**, class programs on this branch: `index cell null` 6 → 0; the case and the witness are
  fully claimed.
- **Q58:** `tests/cases/inference/null-cell-read-before-fill-positions.vl` reads the cell at a
  `string | null`, `boolean | null`, literal-union, record and `i32 | null` argument, a null test,
  a typed `const`, a `map` callback and a `??` operand. On the master seed 7 functions miss on
  `index cell null` and one on `null test nulfold`. On this branch all 16 match in bytes and spans,
  and the armed run (`VL_IR_SHADOW=6 VL_IR_STRICT=1`) prints the `@log` list.
