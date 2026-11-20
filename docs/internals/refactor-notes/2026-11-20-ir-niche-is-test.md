# Fix D17031, and IR: an `is` over a nullable reference niche (2026-11-20, lane IR6)

`a is A` over `a: A | null` is legacy's literal rung's `nicheTest` arm, the niche's null test
(`emitNulIsNullTest(isObj, …, nicheOnly = true)`); `a is C` with `C` outside the niche is its
`nicheNever` arm. Both missed the IR at `is rung`: 38 of the 49 one-blocker `litArms` functions
(nicheTest 24, nicheNever 14; d3204, d16377, d947).

## D17031: the never arm dropped its receiver

`nicheNever` wrote `i32.const 0` alone, so `mk() is C` never called `mk`: check-clean silently
wrong in a value, an `if` condition, a `while` test, an `||` operand and a function body alike. The
dead null test (`emitDeadNullTest`) already evaluates its operand for its effects and drops it
unless it is a bare name. That step is now one predicate, `deadOperandEvaluated`
(`emit_plan_null`), asked by legacy's dead null test and `nicheNever` arm (through
`emitDeadOperand`) and by the IR's `deadNulTest` and niche `is` alike.

## The decided guard keeps its fold

An instance reads its `is` guard's constant back off the bytes (`emittedCondConst`, D932) and does
not lower the arm the constant kills, which reads the receiver at a type the instance's value is
not. A dropped receiver ahead of the `i32.const 0` hid the constant, so the dead arm lowered and
failed to emit (`if z.h is C { print(z.h.s) }` over `A | null`). `emitDeadOperand` now records
where its `drop` ends (`condDeadEnd`, cleared by `condMark` as each condition starts) and the
read-back starts there: what follows a net-zero `drop` at an instruction boundary is the
condition's value. Witness: `tests/cases/narrowing/is-niche-never-dead-arm-of-an-instance.vl`.

Debt, not built here: D932 decides a constant condition by reading the emitted bytes back, which is
why a semantics fix (the receiver's `drop`) broke a decision. The durable fix is a pure
decided-condition predicate (the niche and `is` arm decision itself) consulted instead of the bytes,
by legacy and the IR alike; until it lands, any byte written ahead of a decided condition's constant
must go through `condDeadEnd` or it silently un-decides the guard.

## The IR arms

`boxTest` sends `isArmOf`'s `litArms` to `nicheIsTest`: `nicheNever` is the immediate `false` after
the dead operand step; `nicheTest` is an `RNulTest` over the receiver with `ntAt` the `IsExpr`, built
only at the four arms the lowering has (atom, bool, nullRef, nulStr) and named `is niche test
<arm>` otherwise. The lowering's `nulTestNodeArm` reads an `IsExpr`'s niche-only arm and a
`BinExpr`'s as before, so builder and lowering ask one decision with the same arguments. Only the
nullRef niche reaches it today; a string, boolean or literal-set niche resolves to another rung
first.

## Witnesses

- `tests/cases/narrowing/is-niche-never-evaluates-its-receiver.vl`: the six positions, invalid
  output on master (every effect skipped), right here.
- `tests/cases/narrowing/is-niche-test-arms.vl`: the nullRef `is` and `!(is)` the IR builds, and
  the string, boolean and literal-set niches pinned as legacy runs them.
- `scripts/capability-probes/matrix/is-niche-never-effectful-receiver.matrix.vl`: 0 of 48 cells
  right before, 48 of 48 after.

## Readings

To fill at the merge-base fixpoint.
