## Testing

- **The IR kind lists are sorted, and `tests/ir_lists_layout_test.ts` keeps them so.** The `Rhs` and `IrNode` unions, the long IR match arms in `ir.vl`, `ir_verify.vl` and `ir_lower.vl`, and their `lint.vl` copies `klRhs` and `klIrNode` are in sorted order (the other `lint.vl` IR sets keep the declaration order `ladder-sets.vl` holds them to), so two PRs adding different nodes after the same member insert at different lines. The guard names the first member out of order. Every program the compiler builds is byte-identical; the seed changes only by reordering.
