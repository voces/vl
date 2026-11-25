## Codegen, memory & runtime (Track B)

- Master fix: `irReadsAgain` was declared twice in `compiler/ir_lower.vl` (two PRs added the same helper, each merging cleanly); the second copy is removed.
