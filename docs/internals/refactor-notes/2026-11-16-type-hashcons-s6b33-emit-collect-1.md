# Type hash-cons stage 6b, tier 2: emit_collect.vl's reached walk limits, part 1 (lane HASH), 2026-11-16

`emit_collect.vl` goes 17 → 11. This part takes the self-contained walks. The union-registration
walks (`collectTyReachRegister`, `collectTyMembersReach`, `collectTyReachCloSigs`) carry
depth-graded memos and an ordering contract, and are part 2.

| census row | function | was | now |
| --- | --- | --- | --- |
| 330 | `objFieldHoldsUnionBox` | `depth > 4` | types seen |
| 332 | `anonHolderAwaitsElemRow` | `depth > 8` of nested literals | the literal tree's own end |
| 329 | `forceNestedCloSigRepsOfTy` | `depth > 6` | types seen |
| 333 | `internArmFieldShapeTy` | `depth > 8` | types seen |
| 334 | `internArmShapeOfTy` | `depth > 8` | types seen |
| 323 | `alcCommitAnn` | `depth > 4` | values seen |

## Grading (fixpoint seeds, master `6cd505a50` vs this branch)

- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent, no cell changed class.
- Deep-nesting grid: 240 of 240 run.
- `tests/vl_scaling_shape_test.ts`: passes (`scripts/gate.sh`).
- Self-compile fuel: 94,063.7M against master's 94,029.6M (+0.04%).
- `walk-limit` baseline: 527.
