# Step 7 codecs: `emit_classify.vl`'s `?.`-leaf, map-shape, numeric, closure, string and niche field reads ask the storage, 2026-11-12

This is the second `emit_classify.vl` batch of group 1 in
`2026-11-11-step7-codec-field-rep-column-design.md` (#7250). It stacks on
`2026-11-12-step7-codec-field-rep-classify-arm-reads.md` (#7445).

## What changed

- **`optChainLeafFieldCode` became `optChainLeafFieldRow`.** It hands back the leaf's flat row
  (`sFieldFlatRow`), not its code.
  - Its three union tests ask `fieldRowIsUnionBox`.
  - `exprNulLitUnion`'s `?.` arm asks `fieldRowIsNulAtom` and `fieldRowIsPlainI32`.
- **`mapShapeOfMember`'s three map tests** read the slot table (cut 3c):
  `variantFieldSlotTable(..) == "map"` and `fieldRowSlotTable(..) == "map"`.
- **`memFieldTypeCode` became `memFieldNumKind`.**
  - Its arms read `variantFieldNumKind` and `fieldRowNumKind`.
  - A shared read maps its plan's code through `sharedPlanNumKind`.
  - Its one consumer, the receiver-narrowing widen, takes kinds 3, 4 and 5.
- **`exprIsClosure` and `memberIsClosure`** ask `fieldKindIsClosure(eqRowFieldKind(..))`.
- **Two new `memberFieldPos` predicates**, each with a plan-code answer for a shared read:
  - `exprString`'s field test reads `memberFieldIsStr`;
  - `exprNulLitUnion`'s field test reads `memberFieldIsNulAtom`.
- **New in `emit_atom_kinds.vl`:**
  - `armRowIsStr(r, nul)`;
  - `fieldRowIsNulAtom(r)` and `armRowIsNulAtom(r)`. A `K | null` niche reps as an `i32` with
    a null discipline (`rdNul` nonzero), which is code 30.

## Measurement

`sweep.vl diff`, #7445's fixpoint seed (6,664,963 bytes) against this one (fixpoint, 6,665,389
bytes), over 23,995 programs:

- **23,995 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

## What is left in `emit_classify.vl`

- `readFieldStoreKind`, whose last rung spells a tag from the code number;
- `fieldCodeCellKind`, the code floor for an uncovered storage;
- `ovnStoredAlike`, which compares a code from a type against an arm row's code;
- `sharedUnionFieldPlan`, which builds the plan code from its arms' codes;
- the floor in `sFieldStoreKind`.
