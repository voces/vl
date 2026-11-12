# Step 7 L6: the literal-arm tests off a union name read its member set, 2026-11-12

This is the second batch converting the round-trip callers of `unionNameOfExpr`. Four sites
asked `unionCarriesLitUnionArm(name)`, which parses the spelling for a literal-union arm beside a
value arm. They now ask the member set the union name's row gives (`msSetCarriesLitUnionArm`,
through `unionCarriesLitUnionArmOfSet`), keeping the spelling where the set cannot answer.

## Probe

A probe in `unionCarriesLitUnionArm` compared the spelling's answer with the set's answer for the
name's row. The population is the whole sweep, 24,076 programs, of which 3,932 reach it.

| outcome | programs |
| --- | --- |
| agree, both yes | 98 |
| set does not cover the name (no row) | 53 |
| disagree | 1 |

The disagreement is `MU = MA | MK` in `literal-unions/declared-union-of-litunions.vl`, a numeric
and a string literal union kept apart. Its row is the widened one, `i32,i32,string,string`, so
its members cannot say which arm is literal. A set whose member repeats declines, and the
spelling answers. Only one of the 53 uncovered names answers yes (`K|null|i32`).

## Changed

- `msSetCarriesLitUnionArm` (`emit_rep.vl`) answers from member types and kinds, declining an
  uncovered set or a repeated member.
- `litMembershipRecvOk`, `emitIsTestLitArms` (the literal-arm and numeric-base tests) and
  `emitIsTestVariant` read it off the set the name's row gives.

## Left

The calls in `emitUnionConcreteEq`, the other box-equality site beside it, and `emitIsTest`'s
receiver gate sit beside lane w316's `msSetOfUnionBox` edits, and follow after those land.
`emitUnionUnionEq` compares two names.

## Proof

- **Targeted.** The 3,347 file cells of the 3,932 that reach the test were built on a master seed
  and this one, with batch 1 under it: 3,347 byte-identical modules. CI's sweep is the proof for
  the population.
- **Checks.** lint-self is clean. `regress.vl` loses no runs. The export budget, with findings,
  has 0 dead exports. Render-parse is flat at 13 renders and 55 parses.
