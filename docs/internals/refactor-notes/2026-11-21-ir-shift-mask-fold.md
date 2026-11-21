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

## Readings (merge-base `411447248`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| tests/cases armed shadow covered / matched | 64,246 / 64,245 | 64,368 / 64,367 (same single fail row) |
| the 12 tests/cases files with a shift and a mask, covered (= matched) | 143 | 260 |
| corpus / self-compile functions with no blocker | 44,449 / 19,511 | unchanged (no masked shift there) |
| L2 self-compile fuel | 106,901,368,168 | 106,930,509,649 (+0.027%) |

Left on those files: `shift-mask fold narrowing source` 44 and `shift-mask fold narrowing` 12.

Legacy lines deleted: 0. Moved to `@ir`: 0.
