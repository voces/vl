# Step 7: a u8 value has a rep (the reader's "rep uncovered" class)

Measured 2026-11-07 on master `931e4034` (#6730), 4-core box.

## What changed

`repOfPrim` had no `u8` arm, so `repOfTy` answered "uncovered" for a function whose result is a
`u8`, e.g. `xs.map((e) => e)` over a `u8[]` (`tests/cases/arrays/u8-list-map-positions.vl`). A byte
is packed only inside a `u8[]`. As a value it is an i32, and that is now its rep. The list
descriptors (`u8list`, `nulu8list`) are unchanged.

## The column shadow, post settled (13,514 files compile with no imports staged)

The 12 lambdas in `u8-list-map-positions.vl` now agree pre-mono (`agree i32`), and
`synthRecordedRetAnnots` annotates them before `buildFnMap#2`, so they leave the post-mono walk's
population. `rep uncovered` goes from 13 to 1:
`generic-list-held-or-returned-written-lambda-called-where-it-fits.vl` `__lambda_3`. Declined
functions after #6730: **91 → 79** (12 assignment-target, 32 no token, 17 own record at a
variant, 17 no result recorded, 1 rep uncovered).

## Parked, with what was measured

* **Own record at a variant (17, not 2).** A trial reader that reads the function's own checker
  result agrees with the walk for 2 of them. For 6 the walk follows the delivered variant,
  because every call delivers into the union (`record-fresh-call-into-union-destination.vl`
  `mk2`, `mk3`). For 9 the own record has no token. A reader fix needs to know where the calls
  deliver.
* **No result recorded (17).** A lambda called at two types inside one instance
  (`hole-lambda-calls-per-instance.vl` `two("a", 1.5)`). The elaboration has to instance it per call.

## Proof

| check | result |
|---|---|
| fixpoint | two `refresh-compiler.sh` runs byte-identical |
| seed size | 6,473,999 → 6,474,017 (+18), base is #6730's fixpoint |
| `scripts/sweep.vl` diff, 23,613 cells | 23,613 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 traps |
