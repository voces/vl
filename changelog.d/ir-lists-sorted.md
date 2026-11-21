## Testing

- **The IR kind lists are sorted, and `tests/ir_lists_layout_test.ts` keeps them so.** The `Rhs` and `IrNode` unions, the long IR match arms in `ir.vl`, `ir_verify.vl` and `ir_lower.vl`, and the `lint.vl` sets mirrored from `ir.vl` are in sorted order, so two PRs adding different nodes after the same member insert at different lines. The guard names the first member out of order. Every program the compiler builds is byte-identical; the seed changes only by reordering.
