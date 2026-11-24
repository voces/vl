# IR: a union cast over a boxed nullable operand, 2026-11-24

Lane IR-N4. Base: master 4435b3e3. Class `union cast operand rep`.

## Change

- `asUnion` admits a `boxedNullable` operand (disc 4) beside a box. Legacy's `emitAsUnionCast`
  writes the operand, then `emitAsUnionTagTail`'s tag test. A boxed `T | null` is a non-null box
  carrying `nullBoxTag()` (`emitAsUnionOpt`), so the test reads it as any box, and the null tag
  fails every arm: `as?` yields its null, `as!` traps.
- The verifier's `RAsUnion` rule admits `RNullable` disc 4 beside `RBox`, and nothing else.
- The lowering is untouched: `irLOpnd(auV)` writes what `emitExpr(obj)` writes, then
  `emitAsUnionTagged`, legacy's own tail.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `boxedNullable` (existing, new use) | `emitAsUnionCast`, which hands `emitAsUnionTagTail` the box `emitExpr` leaves, null-tagged or not |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

READINGS
