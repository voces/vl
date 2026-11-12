# Step 7 L6: the box-equality and literal-`is` gates read the box's member set, 2026-11-12

This is the fourth batch converting the round-trip callers of `unionNameOfExpr`. Three gates
asked `unionCarriesLitUnionArm(name)` beside the set they already hold, `msSetOfUnionBox`, which
since lane w316's #7533 is keyed by the read's type: `emitIsTestArmTag`, `emitUnionConcreteEq`
and `emitUnionLitIs`. They now ask `unionCarriesLitUnionArmOfSet` of that set, keeping the
spelling where the set does not answer.

## Probe

A probe in `unionCarriesLitUnionArmOfSet` compared the set's answer with the spelling's at every
call, batch 2's sites included. The population is the whole sweep, 24,094 programs, of which
3,932 reach it.

| outcome | programs |
| --- | --- |
| agree | 3,886 |
| the set declines, the spelling answers | 66 |
| disagree | 2 |

Both disagreements are `string|i32|null`, whose type keys the literal row `K|i32|null`:
`literal-unions/is-litunion-receiver-positions-evaluated-once.vl` and
`literal-unions/nullable-mixed-box-eq-across-delivery.vl`. The set says the box carries a literal
arm, the spelling says not. Both modules are byte-identical below, so the gate's answer does not
reach the lowering there.

## Proof

- **Targeted.** The 3,347 file cells of the 3,932 were built on a master seed (`47b6eb4a`, with
  batch 1) and this one, with batches 2 and 3 under it: 3,347 byte-identical modules. CI's sweep
  is the proof for the population.
- **Checks.** lint-self is clean. `regress.vl` loses no runs. The export budget, with findings,
  has 0 dead exports. Render-parse is flat at 13 renders and 55 parses.
