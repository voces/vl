# IR coverage: SIMD loads and stores along the memory address plan (2026-11-21, lane IR-N7)

`RSimd` (#9332) left the SIMD loads and stores as the named miss `simd memory access`, 71 in
`tests/cases`, because their address is written by `emitMemAddr`. #9310 made that a plan,
`memAddrPlanOf`, so they now build the way `RMemAccess` does.

## Change

- **The builder** (`simdMemRhs`) takes the address along the plan's `const` arm (an immediate 0) or
  `rest` arm (its node), then a store's vector (`memCallArg`). The `bad`, `lma`, `fold` and `wide`
  arms stay named misses (`simd memory address <arm>`).
- **The tail** `simdMemTail(row, off)` writes the access at the plan's offset. Legacy's SIMD arm now
  writes it too, with the operand count `simdMemBase` names.
- **The verifier** holds the address at i32, a store's vector at v128, and a load's result at v128;
  a store has no value. As a statement, a load's discarded value is dropped and a store leaves
  nothing, as `emitCallStmtIdent` does.

## Measured

Against #9310's head plus #9332, with fixpoint seeds on both sides (full table in the PR body):
- `tests/cases` functions with no blocker: 60,284 → 60,349 (+65). `simd memory access`: 71 → 0.
- The self-compile and the distilled corpus hold no SIMD access, and are flat.

The row `tests/ir-shadow-rows/simd-mem.vl` has 5 functions: a load at a node, at an offset, a store
at a node and at a constant, and a discarded load. All 5 miss on #9310's seed and are covered and
matched here.
