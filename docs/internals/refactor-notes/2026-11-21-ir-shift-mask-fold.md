# IR: a masked shift builds as legacy's strength-reduced shift and mask, 2026-11-21

Legacy strength-reduces a masked shift (`shiftMaskFoldOf`). It turns `((x >>> k) & m) << j`, and
the same with `* 2^j`, into one shift netting `k` against `j` and the mask `m << j`. The IR's
binary builder refused every such node by name (`shift-mask fold`, 172 on tests/cases at master
`41144724`).

## The change

`shiftMaskFold` builds legacy's form from `shiftMaskFoldOf`'s `[x, k, narrow, m, j]`, reading the
decision rather than re-deriving it:
- `x` at the fold's width, widened to i64 through `widenPlanOf`'s `plain` arm as
  `srPushSource`/`emitWidened` build it;
- the shift `shru` (k > j) or `shl` (j > k) by the constant difference;
- `and` with the constant `m << j`. At width 32 it is the low word, as `srConst` writes it.

Each is an existing `RPrimOp` with immediate operands, so no IR op is added.

The two narrowing forms stay named misses. Both need `i32.wrap_i64`, which the IR has no op for:
- `(y >>> k) as% i32 & m` (`j = -1`), as `shift-mask fold narrowing`;
- an i64 source read at width 32, as `shift-mask fold narrowing source`.
