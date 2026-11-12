# Step 7 L2 §7: a union's map arm is found by its member type, not its spelling, 2026-11-12

Lane w310 took item (d), `nameIsMap` / `nameIsMapMemberUnion`. Its main callers are the five
map-value slot finders in `emit_union_atoms.vl`, which lane w309 left. Each one asked
`nameIsMap(atom)` whenever the union registry had no member type for an arm. They now ask the
member type, and an arm with no type is not taken for a map.

The base is master with a fixpoint seed on both sides. The population is the whole sweep.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the predicates
note's accumulator. At each of the five sites it compared `nameIsMap(atom)` with the type's answer
(`tyMapHeld`, `unMemIsMap`). It tagged a disagreement and an arm with no member type. The reach tag
is the control. All five sites showed 0 disagreements, and the untyped arms were never maps.

## Changed

- `mvShapeOfValNameArmTyGo`: a ref arm is a map when `tyMapHeld(kindTy)` holds.
- `markMapUnionArmsOf` and `unionHasMapArmSlot`: an arm is a map when its member is
  (`unMemIsMap`). The covered slot comes from `mvSlotOfMapKeyKTys` over the peeled member.
- `unionMapArmNameTy`: the uncovered fallback loop is deleted.
- `emit_union_atoms.vl` no longer imports `nameIsMap`.

## Left

`nameIsMap` keeps its callers in `emit_base.vl` (`mapValNameOf`, `nameIsMapMemberUnion`,
`nameIsBareMap`, `isVariantBoxUnionAtoms`, and two in `monoSubstAnn`, which is lane w317's),
`emit_shape_rows.vl` (`mvValKindOfSpelling`) and `emit_shape_intern.vl` (the shape walk). The
`isVariantBoxUnionAtoms` site was probed too: 372 programs reach it, 0 disagree, and the 4
untyped atoms are the string literal `"a"`. Its neighbour `mapArmValueBoxable` still reads the
spelling, so the site moves with that. The parse goes when the last caller holds a type.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,934 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** Flat at 28 renders and 59 parses, with `--findings`. The parse stays until its
  callers outside this file hold a type.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,445 with 0 failed. lint-self
  is clean. The export budget, with findings, has 0 dead exports.
