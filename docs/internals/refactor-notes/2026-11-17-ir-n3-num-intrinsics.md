# IR N3: the numeric intrinsics through one plan and legacy's one-instruction tail, 2026-11-17

Lane IR-C. After `print` (P1), the coordinator's order puts `f64fromBits` and `f64bits` next. On
the M1 seed, `f64fromBits` held 337 corpus functions alone. The bitcasts share legacy's routing
and width rule with the float intrinsics (`sqrt`, `min`, `copysign`, …) and the integer ones
(`clz`, `rotl`, `divU`, …), so this step covers the three families together. `CLAIMED` stays
empty, and no emitted byte moves.

## What landed

- **`numIntrPlanOf` is the intrinsics' decision.**
  - Its `NumIntrPlan { niArm, niKind, niOp }` names one instruction over every argument at
    one kind (`bitcast`, `float`, `int`), or an integer `abs`/`min`/`max` select (`intAbs`,
    `intMinMax`).
  - A float intrinsic's width is the binary operators' rule (`binMixHardF64`), and an integer
    one's is i64 when an operand is.
  - `emitNumIntr` replaces the three per-family emitters and dispatches on the plan with an
    exhaustive `match`. The tail `numIntrTail` writes the instruction.
- **The routing is shared.** `numIntrCallReached` is `emitCallCoreUserFn`'s own question: no
  function of the name in scope, no closure-valued callee outranking an intrinsic name
  (`unknownCallRoutesRef`, D3607), and no live frame binding (D2010).
- **`RNumIntr { nxArgs, nxOp, nxAt }`**, in the `scalar` family, is built where:
  - the callee resolves to no declaration and reaches the intrinsics;
  - the plan is one instruction;
  - every operand is already at the plan's kind.

  An operand needing a conversion is a named miss (`intrinsic operand coercion`), as is an
  integer `abs`/`min`/`max` (`intrinsic intAbs`, `intrinsic intMinMax`), whose select stages
  scratch slots.
- `NumIntrArm` is registered as a closed set in `compiler/lint.vl`, and `niArm` and `nxArgs`
  in its field tables.

## Pins

Each is a shared witness, one covered function matching legacy and printing the right value:
- `f64fromBits` of `f64bits(1.5)`;
- `f64bits(-0.0 * 2.0)`, which is i64 min;
- `f32bits(1.0)` and `f32fromBits(1065353216)`;
- `min(sqrt(9.0), copysign(2.0, -1.0))` in f64, and `floor` over an f32;
- `clz` plus `rotl` in i32 (155 for 16);
- `divU(-1, 3)` in i64, unsigned.

An integer `abs` is a test of its own: a named miss, never a byte mismatch.

## Coverage

| reading | P1 | this step | gained |
|---|---:|---:|---:|
| self-compile claimed in mode 3 | 5,726 | 5,728 | +2 |
| corpus covered = matched (12,296 cells) | 23,256 | N3COV | N3GAIN |

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical, with the 2 mismatches P1 already reports |
| corpus identity against the P1 seed, 12,294 cells | IDROW |
| mode 3 with `list` and `map` admitted (throwaway build) | self-compile 5,728 claimed and byte-identical, the same 2 fallbacks; corpus M3ROW |
| L2 self-compile fuel | FUELROW |
| seed size, P1 seed to this one | 6,538,612 to 6,540,580 (+1,968); SEEDROW |
