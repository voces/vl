# Step 7 L2 §7: two dead nullable-map strips leave `emit_union_atoms.vl`, 2026-11-12

Lane w310, item (d), sixth part. Two of `nulMapInnerName`'s callers were name producers in
`emit_union_atoms.vl`: `ensureRefElemKindTail` (the `RLK_MAP` arm's `mve`) and
`rlInternNameTy` (its `men`). Both cut the `| null` off a nullable map element's spelling into a
local that nothing read. #7358 removed a third, in `rlElemMapShape`. All three are gone, and
`emit_union_atoms.vl` no longer imports `nulMapInnerName`.

The base is master `10033cbe`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,962 programs.

## Left

`nulMapInnerName` (`emit_map_value_slots.vl`) has one caller: `shapeFieldElemName`'s code-29 arm,
which is lane w311's. `nameIsBareMap` keeps `nulMapInnerName`, w311's `refElemArrName` and
`monoAnnPinName`'s untyped leg, which is lane w317's.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,962 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** Parses flat at 57, with `--findings`. The render count reads 19 against a
  baseline of 20 because of master's `monoPinUnionName` fall, which is not this PR's.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,461 with 0 failed. lint-self
  is clean. The export budget, with findings, has 0 dead exports.
