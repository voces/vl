# IR N2b-2c-1b: a `K | null`'s null test and literal compare through legacy's route, 2026-11-16

Lane IR-C. 2c-1 admitted the `K | null` atom rep. The functions it released stopped at a compare
of a `K | null` against `null` or a literal: on the self-compile, `string operand coercion` held
108 of them alone. This step finishes d3, by the coordinator's ruling, ahead of `string | null`
(2c-2). `CLAIMED` stays empty, and no emitted byte moves.

## What landed

- **Legacy's null test is shared up to the atom arm.**
  - `emitNulIsNullTest`'s arms through the literal-union atom's become one decision,
    `nulTestArmOf` (`NulTestArm`), which legacy branches on. Its arms, in legacy's order: `nnfold`,
    `nulfold`, `nullty`, `bool`, `atom`, `rest`.
  - The atom arm's compare is the tail `nulTestAtomTail`: the sentinel, then `i32.eq`, or `i32.ne`
    for `invert`.
- **`invert` comes from where legacy reads it.** The binary dispatch's operand and direction
  against a `null` literal are `binNulTestOf`, and legacy's own call now passes that `bnInvert`
  into the ladder. The IR stores the same value; it is never recomputed from the operator.
- **`RNulTest { ntV, ntInvert, ntAt }`** is built only along legacy's route:
  - not a dead test (`deadNullTestOperand`);
  - not a pair typed `null` (`nulNoneEqSides`);
  - the arm is `atom`.

  Any other arm is a named miss (`null test <arm>`).
- **An atom compare takes a `K | null` side.** Legacy's `static` arm already writes `x == "a"` over
  a `K | null` as the value, the member's id and `i32.eq`, so only the IR's operand check widened.
- `NulTestArm` is registered as a closed set in `compiler/lint.vl`, and `ntV` in its field tables.

## Pins

Each is a shared witness on a `K | null` holding atom id 0 (`"a"`, the first literal), the id next
to the sentinel:
- `x != null`;
- `null == x` (the operand order reversed);
- `x == "a"`.

## Coverage

| reading | 2c-1 | this step | gained |
|---|---:|---:|---:|
| self-compile claimed in mode 3 | 5,434 | 5,557 | +123 |
| corpus covered = matched (12,294 cells) | 23,124 | 23,125 | +1 |

Together with 2c-1, discipline 3 adds 174 self-compile functions and 48 corpus functions.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical |
| corpus identity against the 2c-1 seed, 12,294 cells | 9,016 identical, 3,278 fail under both, 0 differ (so the null-test split moves no corpus byte) |
| mode 3 with `list` admitted (throwaway build) | self-compile 5,557 claimed and byte-identical, the same 2 fallbacks as before; corpus 9,016 identical, 0 differ, 0 fell back |
| L2 self-compile fuel (`self-compile-time.sh`, each tree from its own fixpoint seed) | 95,316,549,942 to 95,358,365,190 (+0.04%) |
| seed size, 2c-1 seed to this one | 6,516,503 to 6,517,996 (+1,493); +2.8% on the baseline, under +3% |
