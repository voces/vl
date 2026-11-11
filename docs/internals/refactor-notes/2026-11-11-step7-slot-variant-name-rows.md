# Step 7 slot layer: three variant-bank name producers deleted, 2026-11-11

This is queue item 1 of the slot-layer lane: the four variant-bank name-keyed producers of
`2026-11-10-step7-vkind-census.md` §2. The method is the struct bank's (#7105, #7111, #7114,
#7116). Base is master `e7ebdb52` (#7117). Its fixpoint seed is 6,615,085 bytes.

## Orchestrator rulings recorded for this lane

- `calleeAnnRetRefListSlot` stands **by design**. Its "name" is the callee identifier looked up in
  scope, and its answer is the declared return annotation's row. The census counted it as
  name-keyed only because of its spelling.
- **Family B** (`structRowOfNameTy`, 381 programs, #7105) is a **checker fact**. The name carries
  "declared as a union arm", which the type does not. The checker should record each record's
  per-declaration identity (declared arm or standalone), so the emitter can read it beside the
  type. This comes last in the lane, as its own PR series, and it starts with a measurement of
  what the checker would need to record.

## The four producers

| producer | callers | measurement | outcome |
| --- | --- | --- | --- |
| `variantIndexOfTypeName` (a declared arm name, else a field-set scan of a parsed shape spelling) | `sharedUnionFieldPlan`, `mvValArmOfShape` | see V1 and V2 | deleted |
| `variantIndexOfShapeK` (the parsed-spelling scan, at three leniencies) | `variantIndexOfTypeName`, `mvValArmOfShape` | V1 | deleted |
| `variantIndexOfOwnRender` (an arm by its structural render, D762) | `nameIsRefArrayGo`, `refArrElemNameGo` | V3 | deleted |
| `variantIndexOf` (a declared arm's row by its name's sid) | 60 | — | stands; see below |

## Measurement

Each family had its own probe compiler, built by the base seed into scratch and never refreshed
into `build/`. Each probe was swept over the whole population (`scripts/sweep.vl`, 23,868
programs). Each probe was also validated by a reach variant, which fires `emitFail` wherever the
rung is reached at all. The counts below are **programs**.

| family | site | candidate | reached | `DIFF` | `NOTY` |
| --- | --- | --- | --- | --- | --- |
| V1 | `mvValArmOfShapeTy` when `ty` is not a record (it fell back to `mvValArmOfShape(name)`) | -1 | 0 (a whole-span shape with no struct row) | — | 0 answers |
| V2 | `sharedUnionFieldPlan`, per member atom | `variantIndexOf(atom)`, else `repVariantShapeRowOf(ty)`, else `variantRowOfOwnRenderTy(ty)`, where `ty` comes from `msMemberTysOfSet` | ~500 (`{r:i32}` 154, `A` 46, …) | 0 | 0 |
| V2b | the same | the type alone, with no `variantIndexOf` | | 24, every one at a declared arm name | 0 |
| V3 | the own-render rung of `nameIsRefArrayGo` and of `refArrElemNameGo` | — (rung reach after the earlier rungs miss) | 3,085 | — | 0 answers |

- **V2b is Family B again.** Where an atom names a declared arm, the type can resolve to a different
  row. So `sharedUnionFieldPlan` keeps the declared-name lookup in front, and the shape-spelling
  scan behind it becomes the member's type. The member set already carries that type, index-parallel
  to the atoms.
- **V1 and V3 are rungs that never answer.** V1's caller never passes a shape spelling with a
  non-record type. Every element that reaches V3's rung is claimed by a later rung, or by none.

## What changed

- `sharedUnionFieldPlan` asks `memberArmRow(atom, ty)`.
- `mvValArmOfShapeTy` answers -1 for a non-record type. `mvValArmOfShape` is deleted.
- `variantIndexOfTypeName`, `variantIndexOfShapeK` and `variantIndexOfOwnRender` are deleted. So
  is the spelling half of `variantScanK`, which is folded into `variantRowScanOfTyK`, and the
  `exact` flag of `variantRowOwnRender`, `jrSameFieldSeq` and `jrSpelledAlike`. Their last `true`
  caller was `variantIndexOfOwnRender`.

`vkind-census.vl --slots`: the variant bank's name producers go from 4 to 1.

## `variantIndexOf` stands, with Family B

`variantIndexOf` is not a render parse. It reads a declaration's sid, so its answer is the
declaration identity "this name is a declared arm". That is the fact Family B needs on the type
side, and V2b measures it once more. It converts with Family B's checker record, not before.

## Proof

- `sweep.vl diff` of base against the candidate's fixpoint seed: **23,868 same**, 0 bytes-only
  movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- Refresh ×2 is a fixpoint at 6,614,476 bytes (−609).
- lint-self is clean and rep-fuzz is exact.
- The seed-size, late-demands (6), dead-export, render-parse (39 and 70, unchanged), pin-helper and
  plumb-shape budgets are ok.
- cases_wasm, the inventory refs and rows tests, `vl_probe_rollback_test.ts` and
  `vl_scaling_shape_test.ts` pass.
- `check-filed-witnesses --strict` on both inventories: 4,701 as filed, 0 moved.

## Ref-list bank: first readings (queue item 2)

The same probe compilers also covered two `rlSlotByName` sites:

- `arrLitInstElemRow`'s `rlSlotByName(sNames[si])` is **reached in 0 programs**. Every reach
  returns at an earlier guard. Its reach control fired nowhere either, so no candidate can be
  graded on this population.
- In `sFieldRefSlot`'s untyped-field branch, the by-name hit is reached in 0 programs. The
  declared-row rung is reached in 2 (`#anon0`) and the name mint in 2 (`T|K`, and an empty
  name).
