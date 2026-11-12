# Step 7, L6: `variantIndexOf`'s sites graded, and cut 2, 2026-11-12

`variantIndexOf(name)` is the last variant name producer on the exit list
(`2026-11-11-step7-exit-criteria.md`). It answers the first variant row pushed under a
spelling. This note grades its 30 call sites on master `70812c61` (#7615), and switches the four
that hold a type and whose switch the sweep accepts. The population is the sweep's 24,178
programs. Fixpoint seeds were used on both sides.

## The grading method

The sites that hold a type were measured twice.

1. A probe marked each site where the name and the typed answer differ. An answer from one side
   only counts as a difference. The marks accumulate per program, and `emitProgram` reports them
   all at its end, overriding any earlier error, so no site hides behind another. A first-error
   probe read 6 for `memberArmRow`; the accumulating one reads 8.
2. Each site was switched to its type and the sweep was diffed. A probe difference is a different
   row; the sweep says whether a module or an output moves.

| site | probe: differ | switched alone: sweep | grade |
| --- | --- | --- | --- |
| `memberArmRow` | 8, twin arms with different rows; its no-type name fallback never answers | 1 bytes-only, 0 output | **converted**; it takes no name |
| `declArmsMatchRow`'s name loop | 20, a twin the type finds | 12 bytes-only as `unionArmRowOfTy`; **0** as one typed loop that binds only an unnamed twin | **converted** |
| `annDeclVariantRow`'s spelling fallback | 0, never answers | — | **deleted**; the function takes no spelling |
| `collectVariantFields`' declared-record test (`declStructNodeOf(nonNulBaseOf(ftxt))`) | 0, and never answers true | — | **converted** (`fieldNamesDeclRecord`, the field type's declaration) |
| `collectShapeVariantFields`' generic-application rung (`nameIsConcreteGenAppDecl(nonNulBaseOf(ftxt))`) | 0, never reached; two hand witnesses (a `B<i32>` and a `B<i32> \| null` field of an inline arm) are answered by `nameFieldCodeTy` and run | — | **deleted**: a hit now reaches the refusal below it |
| `typeDeclMintsRow`, `collectNestedFieldShapes`' `ownsRow` | 37 each | see below | **floor, named after D15956** |
| `mvValArmOfShapeTy` | 0, and never reached | not switched | open |

**The floor.** `typeDeclMintsRow` asks whether a record declaration is stored at a variant row.
Under #7425 a same-shape twin of an arm shares that arm's row, so the typed answer is the ruled
behaviour. Two typed forms were measured:

- **`tyIsVariantMember(decl type)`:** 1 program goes runs → trap,
  `arrays/mixed-nullable-record-string-literal`, with a cast failure. The checker counts `A` and
  `B` as members of the union inferred from `[xa, null, xb]`, but no variant row exists for an
  inferred union's members, so `A` minted no row at all. This is the wrong question, not a
  hidden defect.
- **`exactArmRowOfTy(decl type) >= 0`**, "a variant row holds this type": 85 bytes-only
  movers, the twins now sharing their arms' rows. 1 program goes runs → not-runs: D36's
  witness becomes an emit reject. D36 ran because its twin `Dot` minted the only struct row
  of the arm's shape. Without it, D36 is its own no-twin control, which master already
  refuses. That defect is filed as [D15956](../inventory/D15956.md): a held list literal of an
  arm-shaped anonymous record, returned, has no struct row for its element's field read.
  Removing the `sDeclared` floor alone reaches "receiver is not a struct", so the fix is the
  variant-row read, not a guard.

So `typeDeclMintsRow` and `ownsRow` keep the declaration's name until D15956 closes. Then
`exactArmRowOfTy(declTyIxOfName(s.tdName)) >= 0` replaces it and D36 is re-graded.

## The other sites, by owner

- **Arm-atom lists (7):** `leqNoteUnionArms`, `unionArmsNeedCloEq`, `wideRetagPairs`,
  `armsHoldHeap`, `wideArmOfRow`, `unionBoxEqColumns`, `isTestedRowIn`. They iterate a union's
  member spellings. They switch when the union registry hands member types (G);
  `isTestedRowIn` is cut 7 of #7306.
- **Spelling ladders in other lanes (13):**
  - D: `monoAnnPinName` ×2.
  - E: `internInlineShapeTyGo` and `structElemArrayLowerable`.
  - F, w311: `refArrShapeKindGo`, `nameIsRefArrayGo` and `refArrElemNameGo`.
  - H's field-code ladder: `nameIsStructDecl`, `armFieldStructRow`, `armFieldDeferredRowOk`,
    `gaeArgIsTyParam`, and `mvShapeOfValNameArmTyGo` ×2.
- **Diagnostics (2):** `fieldTypeRefusalMsg`. A refusal sentence names a spelling by design.
- **Debug (1):** `rowDumpBuild`, by design.
- **This lane (1):** `mvValArmOfShapeTy`, the next cut.
- **Floor (2):** `typeDeclMintsRow`, `ownsRow`, until D15956.

The variant table already carries its type column, `uVarTyIx`, written beside `uVariants` in
`collectU`'s arm loop. A reader holding a row can ask its type there (lane D's
`monoAnnPinName(uVariants[v], …)`).

## Proof

- Refresh ×2 is a fixpoint at 6,724,043 bytes, 258 under master's 6,724,301.
- Sweep against master's fixpoint seed: 24,177 same. One bytes-only mover,
  `unions/shared-nullable-literal-field-read`: `memberArmRow` takes the member type's arm, not
  the first arm of that name. 0 output movers, 0 `runs → not-runs`, 0 new traps.
- lint-self is clean, and `regress.vl` lost no runs.
- Witnesses `--strict`: 4,849 as filed, 0 moved.
- Late demands 8, seed +2.0%, render-parse 13 and 31, and plumb-shape cost passes.
- `variantIndexOf` code call sites go from 30 to 27.
