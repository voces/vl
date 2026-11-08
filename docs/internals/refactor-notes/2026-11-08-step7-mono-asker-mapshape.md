# Step 7: mono's record-row asker and `letCellSlot`'s map shape, 2026-11-08

Two holdouts named by r14 (`2026-11-08-step7-classifier-r14.md`). Counts are calls over the
23,679-program sweep population, read from `classifier-census.vl` and from `clsCensusEnter("SH …")`
shadow keys in a scratch compiler, as r5/r6 did.

**1. `monoArgTyNameRep`'s struct row.** Its record arm asked `structIndexOfExpr` for the
argument's row before mono. It now reads `structRowOfRecordTy(nonNullTy(<argument's checked type>))`.

Shadow, one key per call (the control `inline-shape-local-beside-declared-twin.vl` fired it):

| agree | typed none, old row | differ |
| --- | --- | --- |
| 231 (3 of them both -1) | 1 | 1 |

The two disagreements print the same as base. `record-binding-adopts-generic-union-field.vl`
(old `{v:i32|string}`, typed none) falls to the arena pin below, and that pin names the same row.
`D15331` (`#anon0` against `#anon1`, an `if` over two record literals) is an emit refusal on both
sides, with the same message.

**2. `letCellSlot`'s map arm.** The brief planned to record a map shape per binding at inference.
That turned out not to be needed. The checker fills an un-annotated `Map()`'s key and value
in place on the `TyMap` (`memberCallMapTy`'s `.set` arm), so the binding's own type is closed
and names its shape. The new `letMapShapeOfTy` reads `letBindTy`. It asks the checker's
`recBuildElemTyOf` first (values built at another record's storage), then `mapFindShapeOfTy`,
the type-driven find that handles Set codes, stored-type maps and named values. The `nulmap`
arm is unchanged.

Three typed readers were shadowed or swept in turn (map-arm calls):

| typed reader | agree | disagree | sweep |
| --- | --- | --- | --- |
| `mapShapeOfTyPeeled(letBindTy)` | 6,831 | 357: 152 Set codes, 167 old slot / typed mono, 27 slot numbering, 11 unsupported / mono | — |
| + `setShapeOfTy`, + `recBuildElemTyOf` | 7,109 | 79 | 42 `runs → not-runs` |
| `recBuildElemTyOf`, else `mapFindShapeOfTy` | — | — | 0 movers |

41 of the 42 movers carry a shadow key, and every one is in the `old slot / typed mono` class.
The 42nd, `D12340`, recorded none, and it runs again under the third reader. In each of the 41, the map's value is a record whose own
shape has no mv slot, such as `{r: {q: i32}}` stored at `Circle`'s row (`cells/c030845.vl`), so
`mvSlotOfValTyK` missed and `mapArmShapeOfTy` fell to the mono map. `mapFindShapeOfTy` keys the
slot by the value's declared name, and that closes the class.

**Not done:** the rest of `letCellSlot` was not re-shadowed. r12's whole-function reading stands:
744 disagreements, 479 of them map shapes, so about 265 sit in the other arms. `letMapShapeOf`
keeps its other callers, so it is not deleted.

**Census** (`classifier-census.vl --callers`):

| tree | post-only | pre-only | both | uncalled | `structIndexOfExpr` pre-mono |
| --- | --- | --- | --- | --- | --- |
| master `55fd14c4` | 30 | 0 | 47 | 0 | 262 (233 `monoArgTyNameRep`) |
| this PR, merged with master `8434f8a7` | 36 | 0 | 41 | 0 | 24 |

Six moved to post-only: `globalCellKindGo`, `letCellKind`, `globalCellKind`,
`globalReadStructIndex`, `fnRetStructIndexSid` and `calleeReturnsStructIdxOfRead`. The 24 calls
left come from `memberUnionFieldName` (10), `memberIsClosure` (7) and `memberFieldPos` (5).

**Proof.** Both sides are fixpoint seeds: master `8434f8a7` is 6,530,606 bytes, and this PR
merged with it is 6,530,828 (+222). The sweep over 23,679 programs: 23,679 same, 0 bytes-only,
0 output movers, 0 `runs → not-runs`, 0 new traps.
