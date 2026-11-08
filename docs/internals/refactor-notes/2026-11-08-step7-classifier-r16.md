# Step 7: classifier round 16, the field-read receiver rows and the nullable map, 2026-11-08

Round 16 starts from master `098a4c3c` (#6835). Counts are calls over the 23,679-program sweep
population, read from `classifier-census.vl --callers --keep` and from `clsCensusEnter("SH …")`
shadow keys in a scratch compiler, as r5/r6 did.

**1. `structIndexOfExpr`'s last pre-mono askers.** `memberUnionFieldName`, `memberIsClosure` and
`memberFieldPos` asked it for a field read's receiver row. Before mono they now read
`structRowOfRecordTy(nonNullTy(<receiver's checked type>))` (`memRecvStructRow`); after mono they
still ask the classifier. The census's 24 pre-mono calls were 22 from these three sites and 2 from
`structIndexOfExpr` recursing through `structIndexOfMemberExpr` under them. All come from four
programs, the `un-annotated-inline-record-callback-beside-*` cases and D3900/D3921 (an
un-annotated `{ v: { x: 9 } }` mapped through a generic).

| site | agree (a row) | agree (none) | disagree |
| --- | --- | --- | --- |
| `memberUnionFieldName` | 10 | 0 | 0 |
| `memberIsClosure` | 7 | 0 | 0 |
| `memberFieldPos` | 5 | 0 | 0 |

**`structIndexOfExpr` now has 0 pre-mono calls.**

**2. `letCellSlot`, re-shadowed per arm** against `repSlotOfKind(k, letBindTy)` (nulmap against
`letMapShapeOfTy`). The `claim-*` arm reads `letBindRepSlot`, which is already the rep's slot at
its recorded type, so it is not type-blind. It agrees on every kind except `struct` (66) and
`nulstruct` (24), where `bcTy` and `letBindTy` name different rows.

| arm | reader today | agree | disagree | missing fact |
| --- | --- | --- | --- | --- |
| `nulmap` | `nulMapShapeOf` | 174 | 21 | none: switched (3 below) |
| `reflist` | `letRefListSlot` | 11,024 | 35 | a list whose element holds a hole at a generic pin (`{ fs: [inc0], x: T }`, `d15293_*`, `hole-fn-*`); typed reads −1 |
| `struct` | `structIndexOfLet` | 19 | 11 | a single-member alias (`type MyCat = Cat`, `struct-alias-transparent.vl`); typed reads −1 |
| `variant` | `letObjLitVariantIdx` | 1 | 0 | too few calls to grade |

The `reflist` and `struct` classes need a fact the typed reader does not have, so neither is switched.

**3. `nulMapShapeOf`.** Its 21 disagreements are 18 Set codes and 3 slot numberings. For a nullable
Set binding, `mapShapeOfExpr` over the initializer answers the mono map of the key kind
(`-4`, `-1`, `-6`), and the typed reader answers the Set flavour (`-5`, `-2`, `-7`). The typed
reader is the one that matches the non-null arm: `letMapShapeOf` answers the Set code for a
non-null Set. Both codes build the same layout, so no program prints differently. The other 3
(`0/2`, `5/8`) are two mv slots with one shape, in D93 and
`nested-arm-valued-map-beside-layout-twin.vl`. All 14 programs print the same on both seeds.
`letCellSlot`'s nulmap arm now reads `letMapShapeOfTy`. `nulMapShapeOf` keeps its two
`mapShapeOfExpr` callers.

**Proof.** Both sides are fixpoint seeds: base `098a4c3c` is 6,531,632 bytes, this PR 6,531,678
(+46). The sweep over 23,679 programs: 23,677 same, 2 bytes-only (D93 and
`nested-arm-valued-map-beside-layout-twin.vl`, the two slot numberings above), 0 output movers,
0 `runs → not-runs`, 0 new traps.
