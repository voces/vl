# IR B0b: the literal, tag and numeric `is` rungs as exact plans and writers, 2026-11-18

Lane IR2. B0 (#8984) made `isArmOf` the one decision legacy's `is` ladder consumes, but three try
rungs (`litArms`, `armTag`, `numLit`) decided while they wrote, so `isArmOf` carried a 33-line
summary of each beside its writer. This step makes each an exact plan and a writer of the arm the
plan names, and the summaries go. No emitted byte moves.

## What landed

- **`litIsArmOf` names `emitIsTestLitArms`'s arm** (`LitIsArm`, 14 members): a scalar map read's
  presence (`mapNull`, `mapHas`), a ref niche (`nicheNever`, `nicheTest`, `nicheRaw`), an atom
  (`atomNotNul`, `atomTrue`, `atomEq`), a box's literal arms (`boxLits`, `numBox`), and literal
  membership (`memberTrue`, `memberNoRecv`, `memberEq`). `emitScalarMapReadIs` folds into it.
- **`tagIsArmOf` names `emitIsTestArmTag`'s arm** (`TagIsArm`, 12 members), the receiver shapes
  ending in a delegation to `tagIsValueArm`. `boxTagIsTail` is the tag compare the six tag arms
  shared by copy. `mapSoftTwinTagFail`'s check is `mapSoftTwinClashOf`.
- **`numIsPlanOf` is `emitIsTestNumLit`'s plan** (`NumIsPlan`: the width, the members, and
  whether a receiver is read once into a slot).
- **List emptiness is its own rung, `emptyFit`.** `emitListEmptyFitIs` reserves legacy's fit
  state while it decides and may still decline, so it stays a try rung, and `armTag` after it is
  exact.
- In `isArmOf` every rung is now decided exactly but `recordFit`, `listFit`, `listAcross` and
  `emptyFit`, whose writers keep legacy's own conditions.
- `LitIsArm` and `TagIsArm` are registered as closed sets in `compiler/lint.vl`.

## Lines

B0b is +17 over B0: wasmEmit +379/−374, and lint +12 for the two closed sets. It deletes the three
summaries (33), `emitScalarMapReadIs` (16) and every decision the three writers made between their
writes (about 150 lines of conditions); it adds the plans (about 140), their closed types (about
30, one member a line) and the writers' `match` frames.
