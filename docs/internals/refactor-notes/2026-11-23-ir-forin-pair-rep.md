# IR: a map walk's value at any rep, 2026-11-23

Lane IR-N4. Base: master ff34a69e4. Class `for in pair rep`.

## Change

`for k, v in m` binds `v` to the pair slot that legacy's walk writes each value into
(`forInPairInit` and the per-iteration write), whatever the value's rep. The lowering already
binds the second name to that slot (`forInPairSlotOf`, checked against `varSlot`) and writes
nothing there itself. The builder admitted the binding only at an `i32` or a `string`, and the
verifier had the same rule.

- `forInStmt`: a map walk's second name takes its value type's rep
  (`repNodeOfTy(forInBindTy(...))`); a sequence's index must still be an `i32`.
- `ir_verify`: a non-map walk's second name is an `i32`; a map walk's value may be any rep, which
  rule 3 ties to its type.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `forInBindTy` (the pair's type, read by the builder) | legacy's pair-slot declaration and `forInPairInit` |

## Legacy tails the IR calls

- None new.

## Witnesses

READINGS
