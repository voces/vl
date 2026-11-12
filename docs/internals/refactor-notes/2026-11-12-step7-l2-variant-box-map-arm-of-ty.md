# Step 7 L2 §7: a variant box's map arm is found by its type, 2026-11-12

Lane w310, item (d), third part. `isVariantBoxUnionAtoms` (`emit_base.vl`) counted a union
atom as a map arm when `nameIsMap` read its spelling as one. It now asks the atom's type
(`atomTyIsMap`, `tyMapHeld`), beside the `atomTyIsArray` rung below it. An atom with no type is
not a map arm. `mapArmValueBoxable`, which gated the arm, was a constant `true`, so it is
deleted. The #7333 note said it read the spelling; it read nothing.

The base is master `f114c02a`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,945 programs.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the predicates
note's accumulator. 372 programs reach the rung, the spelling and `tyMapHeld` disagree in 0, and
the 4 atoms with no type are the string literal `"a"`, which is no map.

## Left

`nameIsMap` keeps `mapValNameOf`, `nameIsMapMemberUnion`, `nameIsBareMap`'s spelling-only
callers, `mvValKindOfSpelling`, the shape walk (`emit_shape_intern.vl`) and `monoSubstAnn`'s two
calls, which go once lane w317 moves `emit_mono`'s callers off it.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,945 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** Flat at 22 renders and 58 parses, with `--findings`, on both sides.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,450 with 0 failed. lint-self
  is clean. The export budget, with findings, has 0 dead exports. The comment trim leaves the
  seed byte-identical.
