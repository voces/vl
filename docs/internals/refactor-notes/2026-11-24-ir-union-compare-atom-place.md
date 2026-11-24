# IR: a `K | null` place operand on a union compare's null leg (2026-11-24, lane N10)

Item (a) of S1's union-compare small lists, built on #9829's operand re-read. A `K | null`
literal-union operand takes legacy's leg 1 in `emitUnionConcreteEq` (`nulOther`). Its id is
tested against `-1`, which answers the box's null or 0. In the plain arm, `emitUnionEqOther`
(`emitStrValue` → `emitAtomToStr`) reads the operand again and decodes it to its member string.
`unionEqNulPlanOf`, which only the IR asks, gave leg 1 only to a staged operand (D17066), so a
place operand missed with `union compare plan`.

- **Plan** (`unionEqNulPlanOf`): leg 1 for any `K | null` operand; the staged one still parks.
  Legacy never calls it, so its bytes do not move.
- **Builder** (`unionConcreteEq`): leg 1 takes an `atomNullable` operand rep. A field or global
  operand is read again under #9829's rule (`recvReadsAgain`, beside a box read as a variable).
- **Lowering** (`unionNulEq`): the plain arm's operand (read again, read in place, or from its
  slot) is followed by `unionEqAtomOperandTail`, the decode S1's staged leg already writes.
- **Verifier**: an operand read again (`ucOtherAgain`) is refused off a null leg, on a parked
  operand, or beside a box that is no variable. Control `irShadowCorrupt(8)` marks a plain
  compare's operand as read again, and `vl_ir_shadow_test.ts` wants the verifier's failure.

## The decode's two arms

`emitAtomToStr` decodes through the checker's record (`atomSeat`, `apWhy == ""`), or through the
floor's tower when the read is `held` (mid-coercion) or the record is missing, holds no member,
differs in `null`, or is wider than the site's members (`atomFloorWhy`). A throwaway instrumented
build counted the arm for each leg-1 compare. It was built into a scratch seed only, never into
`build/`, and deleted afterwards (Q59). Every compare took the table arm: the 37 corpus and test
programs, all 108 sweep positions, and 8 probes. The probes were a `"a" | null` operand, an
operand narrowed past a third member, an alias holding `null`, a generic instance, a capture, a
loop variable, an `if`-valued local and a module `const`. The tower arm is unreached from a
compare operand: a compare's operand is never `held`, and each probe had a matching record. If
it is ever reached, the IR's plan (`held` false) differs from legacy's, and the armed shadow
reports a mismatch rather than writing wrong code.

## Legacy tails the IR calls

None new: `unionEqAtomOperandTail` (S1's staged leg) and #9829's `opndAgain` second read.

## Readings (base @@BASE@@, fixpoint seeds on both sides)

@@READINGS@@
