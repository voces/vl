# Const cells under the test refusal hook (2026-11-25, lane COV-START)

INFRA's I8 red list (regeneration 6, #10096) names three programs that still reach `i8 stub
emitExpr`:
- the capability matrix's `binding` row under `--test-emit-refusal`;
- `vl_emit_diag_position`'s global-cell fixture;
- witness D15158.

It counts all three as const-cell initializers.

## The mechanism

`constCellClaimed` (`emit_sections.vl`) kept every constant cell on legacy's writer whenever
`--test-emit-refusal` was set, on the ground that the hook instruments legacy. But the hook
refuses its own cell (`__vl_test_emit_refusal__`) in `emitGlobalSection` before any initializer is
written. So the only cells the condition kept on legacy were the ones around the hook, and at I8
those reach the stubbed `emitExpr`. The condition is gone. The box-dst shadow's condition stays,
since that shadow does instrument legacy.

## Measured

D15158's witness, `vl check --codegen --test-emit-refusal`, census probe (`$VL_IR_SHADOW=5`):

| reading | master | head |
|---|---:|---:|
| const cells the IR writes | 0 | 2 |
| the refusal's position | `:2:5` | `:2:5` |

`vl_emit_diag_position_test` and `vl_capability_matrix_test` pass (14 of 14). No Q58 sweep: the
change is to the test hook's mode only; without the flag the same cells were already claimed.
