# IR null tests: the folded arms, and a nullty field with no storage rep (2026-11-25, lane COV-IS)

- **`null test nulfold`**: a null test whose operand the checker narrowed to `null` (`nulfold`) or
  past it (`nnfold`) is legacy's constant (`emitNulIsNullTest`), the operand unread; the builder
  declined both arms. It now answers the constant, inverted for `!=`.
- **`null test nullty operand`**: the `nullty` arm reads its operand and drops it
  (`nulTestNullTy`); a field whose receiver no row decision reached had no storage rep
  (`rawFieldRepOf`), and the builder declined. Its value is dropped, so the general form reads it as
  the node reads it (`exprAt`): its effects stand, its bytes may differ (behaviour parity, #10171).
- **The class** (`VL_IR_SHADOW=2`): `soundness/null-narrowed-else-read-of-nullable-local.vl` matches
  in full; `soundness/null-narrowed-niche-read-keeps-its-cell.vl` moves on to `member record`;
  `soundness/fresh-null-field-call-delivered.vl`'s start matches; `unions/narrow-literal-list-builds-at-arm.vl`'s
  moves on to `index element coercion`. `ir-parity.vl --behaviour-only` reads `same` on both
  nullty programs.
- **Q58 position sweep** (`tests/cases/null/narrowed-to-null-test-folds-positions.vl`, new): a print,
  an `else if`, a `const`, a return and an `&&` operand. On master 5 functions are `null test
  nulfold`; here all 7 match.
