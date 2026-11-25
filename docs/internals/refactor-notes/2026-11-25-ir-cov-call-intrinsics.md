# IR: the integer select intrinsics, widened intrinsic operands and `__log__`, 2026-11-25

Lane COV-CALL, PR A. Base: master 7eddff27, fixpoint seed from `refresh-compiler.sh`.

## Census of the lane's classes on master (scratch detail census, not committed)

A throwaway compiler split each umbrella miss into its sub-reason. It ran over every
`tests/cases` program (9,347), every witness filed `runs` (5,141) and every probe (281).

| class | cases | witnesses | probes |
|---|---:|---:|---:|
| distinct functions claimed, all classes | 44,370 / 45,442 (97.6%) | 11,463 / 11,645 (98.4%) | 644 / 650 (99.1%) |
| `call of a non-declaration` (distinct functions) | 15 | 8 | 0 |
| `indirect call` | 8 | 2 | 0 |
| `intrinsic none` (`__log__`, `__trap__`) | 4 | 1 | 0 |
| `intrinsic intMinMax`, `intAbs` (same miss line) | 20 | 2 | 0 |

The 2026-11-20 figures for the first three classes were 627 / 161 / 9, 413 / 90 / 4 and
241 / 29 / 29. The classes have since nearly closed.

## Change

- **Integer `abs`/`min`/`max`.** Legacy's `emitIntAbs` and `emitIntMinMax` write their operands,
  then one shared tail, `intSelTail` (`wasmEmit.vl`). `RNumIntr` gains `nxSel`
  (`op | abs | min | max`) and `nxWide`, and its lowering calls the same tail. The tail now takes
  the staging slots after the operands, where legacy took them before; the IR and legacy share the
  order, so the bytes match by construction.
- **Operand coercion.** `numIntrOperandTy` is `emitExprAsKind`'s width for a plan. `numIntrRhs`
  delivers each operand at it (`deliver`, `widenPlanOf`), so an i32 operand of an i64 or float
  intrinsic no longer misses as `intrinsic operand coercion`.
- **`__log__`.** It is an `RCallHost` of the reserved `gMemLogIdx` import, both operands i32 as they
  stand (`emitCallCoreLog`).

## Delta on the class's programs (distinct functions, start bodies apart)

| | cases before | cases after | witnesses before | witnesses after |
|---|---:|---:|---:|---:|
| `intrinsic *` functions | 19 | 1 | 1 | 0 |
| `intrinsic *` start bodies | 8 | 0 | 2 | 0 |

The one left is `__trap__` taken as a value (`tests/cases/intrinsics/checker-special-intrinsic-as-value.vl`,
`__lambda_2`). It is a `never` function's expression body, where legacy writes the value and then
its pad `unreachable`, and the IR's tail return writes `return`. A trap value needs that tail rule
first; it is left for the closure-call PR.

## Proof

- Q58 sweep: `tests/cases/intrinsics/int-select-positions.vl`,
  `intrinsic-widened-operand-positions.vl` and `log-call-positions.vl`. Each position is a function
  of its own, at i32 and i64, with widened operands. Each builds under `VL_IR_SHADOW=6` with no
  mismatch and is claimless-identical. Every position function is claimed after the change and
  unclaimed before. One function stays unclaimed in another class (`coalesce mapScalarJoin default
  computes`): it runs and is claimless-identical.
- `scripts/ir-identity.sh --cases`: `cases: identical 8195, fail under both 74, differ 0, timeout 0,
  expected divergence 2`; `witnesses: same 89, differ 0, timeout 0, expected divergence 0`.
- `scripts/ir-identity.sh --claimless`: `claimless: identical 14524, fail under both 3267, differ 0,
  timeout 0, expected divergence 1`.
