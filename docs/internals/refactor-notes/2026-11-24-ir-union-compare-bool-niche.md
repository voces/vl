# IR: a `boolean | null` operand against a union with no `null` arm (2026-11-24, lane N10)

Item (b) of S1's union-compare small lists. With no `null` in the box, `unionConcreteEqPlanOf`
gives a `boolean | null` operand the plain plan at kind 1. `emitUnionEqOther` writes the operand
as `emitExpr` writes it, the niche's i32 (0, 1, or 2 for `null`), and `unionEqCmpTail` compares it
with `i32.eq` against the bool payload. So a `null` never equals a bool, and no null leg is
owed. The IR built the same read, but `unionConcreteCompare` took kind 1 only at `ibBool`, so it
missed with `union compare operand rep`. Off the null leg it now also takes a `boolNullable`
operand rep.

`byParam`'s compare is, on both seeds:
`(i32.eq (struct.get $6 0 (ref.cast (ref $6) (struct.get $7 1 (local.get $0)))) (local.get $1))`.

## Legacy tails the IR calls

None new: `unionEqHead`, `unionEqTagTail`, `unionEqPayloadTail`, `unionEqCmpTail` (#9749).

## Readings (base 86dd7914, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| tests/cases `union compare operand rep` (IR-only census) | 1 → 0 functions (`boolField`); no other row moved |
| distilled corpus, mode 4 | `union compare operand rep` 10 → 0: the `d17065_box_bool_x_*` (6) and `d17065_op_bool_x_*` (4) named cells; no other row moved |
| Q58 position sweep (`union-eq-bool-niche-operand-positions.vl`, `VL_IR_SHADOW=6`) | 18 positions × operand null, true, false × box true, false, 1: base 18 miss, head 18 matched; output identical on both seeds |
| `ir-identity.sh <base> <head> --names` | identical 9433, differ 0, built under one only 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7756, fail under both 68, differ 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14453, differ 0 |
| legacy A/B (tests/cases + probes) | 7,823 programs, 0 moved |
| L2 self-compile fuel per PR | +0.00% on 124,976,035,786 |
| late demands / late tag rows | 9 (baseline 9) / 307 (baseline 307, 0 gone) |
| `self ir misses` | 0 (baseline 0) |
| IR tests / `vl_deep_nesting_test.ts` | 516 passed / 8 passed, 0 failed |
| shadow row `union-compare-bool-niche-operand.vl` | head 7 covered = matched; base 1, 6 `union compare operand rep` |

The sweep's 18 positions are a direct call argument at a scalar and at a union parameter, a
nested call argument, an interpolation hole, an annotated `return`, a `const` initializer, an `if`
arm value, a `??` operand and a record-literal field, each with the operand a parameter and a
record field. A string-concat operand takes a boolean only through a call, which the argument
positions cover.

## Left in the pool

- (a) the `K | null` place operand (`atomNoNull`): `unionEqNulPlanOf` gives leg 1 only to a
  staged operand; a place one needs leg 1 with `emitUnionEqOther`'s atom decode in the plain arm.
- (d) operand rep: `union-eq-narrowed-let-operand` and `union-closure-arm-equality` starts.
