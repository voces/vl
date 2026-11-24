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

## Readings (base 24f48936, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| distilled corpus, mode 4 | `union compare plan` 26 → 0 (`d17065_box_atom_{n,x}_{param,global,call}_{L,R}`, `d17065_mix_atom_*_param`, `d17065_op_atom_{n,x}_{eq,ne}_{field,global}`); no other row moved |
| tests/cases (IR-only census) | `union compare plan` 109 → 0 (`atomNoNull` and the sweep's 108); no other row moved; fully IR-only programs 6,162 → 6,164; self-compile 0 missed |
| Q58 sweep (`union-eq-atom-null-leg-operand-positions.vl`, `VL_IR_SHADOW=6`) | 108 positions: 9 positions × parameter, field and global × `==` and `!=` × a box with and without `null` (K = `"a" \| "b"`, operand `null`, `"a"`, `"b"`); base 108 miss, head 108 matched; output identical; claimless identical 2 of 2 (sweep and shadow row) |
| `ir-identity.sh <base> <head> --names` | identical 9433, differ 0, built under one only 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7788, fail under both 68, differ 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14459, differ 0 |
| legacy A/B (tests/cases + probes) | 7,856 programs, 0 moved |
| L2 self-compile fuel per PR | +0.01% on 125,882,218,463 |
| late demands / late tag rows | 9 (baseline 9) / 307 (baseline 307, 0 gone) |
| `self ir misses` | 0 (baseline 0) |
| `lint-self`, `gate.sh --fast` | clean, passed |
| IR tests, door guard, emitter audit (`SELFHOST_NATIVE_ALIGN=1`) / `vl_deep_nesting_test.ts` | 553 passed / 8 passed, 0 failed |
| shadow row `union-compare-atom-place-operand.vl` | head 4 covered = matched; base 1, 3 `union compare plan` |
| control `irShadowCorrupt(8)` | the verifier refuses the marked compare |
