# Step 7 L6: the wide-retag arms and the numeric-join kinds read the union name's row, 2026-11-12

This is the third batch converting the round-trip callers of `unionNameOfExpr`. Three sites took
the returned spelling back to its members: `wideRetagPairs` through `unionArmsOf`, and
`njMembersOf` and `njBoxHoldsNull` through `njKindsOfUnionName`. They now read the set
the name's row gives: `unionArmsOfSet` for the arms, and the set's banked value kinds
(`msMemberValKindsOf`) through `njKindsOfUnion`. The spelling answers where no set does.

## Probe

A probe compared each new answer with the old one, element for element. The population is the
whole sweep, 24,076 programs.

| site | programs | same | differ | spelling fallback |
| --- | --- | --- | --- | --- |
| `njKindsOfUnion` | 21 | 21 | 0 | 1 |
| `wideRetagPairs` arms | 978 | 976 | 2 | — |

The two arm lists that differ are `K|null|i32` in
`literal-unions/nullable-mixed-box-eq-across-delivery.vl` and `i32|string` in
`unions/print-if-expression-join.vl`. Both modules are byte-identical below.

The retag pair `boxRetagNeeded`/`emitBoxAtomRetag` compares two spellings, so it is left with
`emitUnionUnionEq`.

## Proof

- **Targeted.** The 894 file cells reaching either site were built on a master seed and this
  one, with batches 1 and 2 under it: 894 byte-identical modules. CI's sweep is the proof for the
  population.
- **Checks.** lint-self is clean. `regress.vl` loses no runs. The export budget, with findings,
  has 0 dead exports. Render-parse is flat at 13 renders and 55 parses.
