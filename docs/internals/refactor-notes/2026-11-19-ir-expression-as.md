# IR: a numeric `as` through one arm decision and legacy's tail (2026-11-19, lane DEAD)

`expression as` blocked 340 corpus functions alone on master 55155fe2: 337 of them are one
std:fmt float-render helper compiled in every nj2 cell. Its casts are `as!` and `as%` between
i64, i32 and f64. This step covers a numeric `as` the way N3 covered the intrinsics: one shared
decision, an operand at one kind, and legacy's own tail.

## What landed

- **`asCastArmOf` is `emitAsCast`'s ladder** as one decision over the closed `AsCastArm` (16
  arms). `emitAsCast` is an exhaustive `match` on it. The wrap cast's own ladder is `asWrapArmOf`
  over `AsWrapArm`. Both sets are registered in `compiler/lint.vl`.
- **Three arms are an operand and a tail:**
  - the plain conversion (`numPlainCastKind` / `numPlainCastTail`);
  - the wrap that is neither a literal fold nor a narrowed mask (`numWrapCastKind` /
    `numWrapCastTail`);
  - the exact-or-fail cast (`numExactCastKind` / `numExactCastTail`: the stash, the test, the
    sad path, the conversion).

  Legacy writes each as `emitExprAsKind(operand, kind)` then the tail. `numCastKindOf` and
  `numCastTail` answer for the cast node, with -1 for every other arm.
- **`RNumCast { ncV, ncAt }`**, in the `scalar` family:
  - the builder takes it where `numCastKindOf` answers and the cast is an `as!` (`as?` and the
    propagating `as` stay `expression as`);
  - the operand is built and widened to that kind as `emitExprAsKind` builds it, the plan being
    `plain` (a literal arm is a `widen <arm>` miss);
  - the lowering is the operand, then `numCastTail`.

## Pins

Two programs of 21 casts. Each function is covered and matched, prints legacy's values, and builds
byte-identical both as shipped and in mode 3:
- `i32→f64`, `i32→f32`, `i64→f32`, `i32→i64`, `f32→f64`, `i64→f64`;
- `as% i32` over an i64, `as% u8`, `as% i64`;
- `as!` from i64 to i32 and u8, from f64 to i32, from f32 to i64, and from i64 to f64;
- a cast of a call, nested casts, `3 as f64`, and a failing `as!`, whose trap message and
  backtrace match.

## Coverage

| reading | master 55155fe2 | this step | gained |
|---|---:|---:|---:|
| corpus functions covered = matched (`ir-shadow.vl`, 45,675 functions) | 30,652 | 30,992 | +340 |
| `expression as` alone in the blocker census | 340 | 0 | -340 |
| self-compile functions the shipped claim emits (`$VL_IR_SHADOW=5`) | 12,670 | 12,696 | +26 |

That is 340 corpus functions for 181 net compiler lines (+355 −174). Behind it, `wide literal`
now blocks 674 functions alone. The census counts only each function's first miss, and that class
was hidden behind `expression as` in the same statements.

## Bars

| bar | reading |
|---|---|
| legacy refactor alone, `ir-identity.sh` plain | 9,034 identical, 3,267 fail under both, 0 differ; self-compile identical |
| `ir-identity.sh` plain, master seed against this one | 9,034 identical, 0 differ; self-compile identical |
| `--names` | 9,034 identical, 0 differ; self-compile identical |
| `--cases` | 7,511 identical, 68 fail under both, 0 differ |
| mode 3 over the corpus (this seed shipped against this seed under `$VL_IR_SHADOW=3`) | 9,034 identical, 0 differ; self-compile identical |
| armed shadow | 30,992 covered, 30,992 verified, 30,992 matched; `ir-shadow: ok` |
| `--claims` | 30,992 emitted by the IR; ok |
| seed fixpoint | a second refresh is byte-identical |
| `regress.vl` | 0 runs → not-runs, 0 → silent of 260,825 census cells |
| L2 fuel (`self-compile-time.sh`) | 99,247,736,231, +0.2% on its baseline |
| seed size | 6,780,517, +0.5% on its baseline |
| late demands | 9 in 7 files, baseline 9; late tag rows 307, baseline 307 |
| lint-self | clean |
