# Step 7 L6: four set lookups off a union name take its row first, 2026-11-12

This is the first batch converting the round-trip callers of `unionNameOfExpr`: callers that take
the returned spelling back to its row's member set with `msSetOfUnion(name)`. They now ask
`unionNameRowOfExpr` and read the set off the row (`msSetOfRowOr`), keeping the spelling only
where no row came back.

## Census

`unionNameOfExpr` has 40 callers, in `emit_classify.vl` (8), `emit_fn_scans.vl` (3) and
`wasmEmit.vl` (29). The name flows on mostly into `unionCarriesLitUnionArm` (8), `msSetOfUnion`
(7), `isValueUnionOfSet` (5), `unionMemberSetOf` (3), `unionArmsOf` (2) and `msSetOfUnionBox`
(2). This batch takes the four `msSetOfUnion` sites that read one name:

- `sharedUnionFieldPlan` (`emit_classify.vl`);
- `litMembershipRecvOk`, `emitIsTestLitArms` and `emitIsTestVariant` (`wasmEmit.vl`).

`emitUnionUnionEq` is left out: it compares two operands' names, so its round trip is the
comparison itself.

## Probe

A probe in `msSetOfRowOr` tagged each call: a row whose set is not the name's set, and a call
with no row. The population is the whole sweep, 24,076 programs, of which 161 reach the four
sites. One program's row gave another set than its name:
`unions/inferred-return-literal-member-union.vl`, a twin row under the spelling `i32|string`. 61
came back with no row and keep the spelling.

## Proof

- **Targeted.** The 132 of the 161 cells that are files were built on a master seed and this one:
  132 byte-identical modules, the twin included. CI's sweep is the proof for the population.
- **Checks.** lint-self is clean. `regress.vl` loses no runs. The export budget, with findings,
  has 0 dead exports. Render-parse is flat at 13 renders and 55 parses.
