# Step 7 slot layer, family B, PR 3: the type's-first-name sites read the declaration, 2026-11-11

This is item 3 of the series in `2026-11-11-step7-famb-decl-identity-census.md` (§3, the value
writer), after #7139 (the annotation column) and #7150 (the cast's arm tag). Base is master
`94b382ce` (#7157). Its fixpoint seed is 6,619,508 bytes.

## What changed

- **The checker records the declaration an `is` test names.** `checkIsExprNode` calls
  `annDeclNote` on the `is` node, beside the banked tested type. The node is no annotation
  node, so it collides with none in `annDeclPos`/`annUnionDecl`.
- **`declVariantRowAt(ann, ty)`** (`emit_local_slots`) answers the variant row of the record
  declaration node `ann` names at type `ty` (`annArmDeclPosOf`). Where none is recorded, it
  answers the first record declared at `ty`.
- **`annDeclNameOf(ann, spelled)`** answers the record an annotation names: its recorded
  declaration, else the spelling.

| site | before | after |
| --- | --- | --- |
| `isTestedRowOf` (`emit_obj_lit_fits`), both callers in `wasmEmit` | `variantIndexOf(structNameOfTy(ty))` | `declVariantRowAt(isIx, ty)` |
| `cloRetValSlot`'s declared-variant rung (`emit_classify`) | `variantIndexOf(structNameOfTy(t))` | `declVariantRowAt(fd.fnRet, t)` |
| `retStructRowIndex`'s TypeRef rung (`emit_nullable_rets`) | `structIndexByName(ty.tyName)` | `structIndexByName(annDeclNameOf(tyIx, ty.tyName))` |

## Measurement

The probe compiler was built from the candidate plus the probe by the base seed, and never
refreshed into `build/`. Each program reported once, at the end of `emitProgram`, overriding
any earlier emit error. The probe's tags:

- **A, B, E**: at the three sites, the old and new answers differ.
- **`.tymiss`**: a declaration is recorded, but its type is not the one the site asks about.
- **`.nodecl`**: the site asks about a type that a second declared record shares (`tySame`),
  and no declaration is recorded.
- **C, D**: the two remaining `variantIndexOf(structNameOfTy(...))` readers, the pre-mono arm
  of `exprVariantIndex` and `mfRecordElemRowName`, see such a shared type.

A forced control (a tag at `isTestedRowOf`'s entry) fired. The sweep covered 23,894 programs.
Counts are **programs**:

| tag | programs | what they are |
| --- | --- | --- |
| A, B, E (an answer changed) | 0 | — |
| C, D (a shared type reaches the reader) | 0 | — |
| `A.tymiss` | 3 | the banked tested type is the receiver's member or a meet, not the declaration's type; the old answer stands |
| `A.nodecl`, `B.nodecl` | 1, 3 | a match payload's test, and monomorphised instances whose pinned spelling the checker never resolved; the old answer stands |

A base sweep of the same population and the probe sweep differ in exactly those 7 programs,
which the probe made emit rejects. The other 23,887 are the same, module bytes included.

## Grading

- **The three sites are byte-identical by construction.** A declared record's own type index is
  distinct from any same-shape declaration's (`cStructFirstPos` is per index), so where a site
  holds the declaration's own type, its first name already *is* the declaration. The column
  makes that a declaration read instead of an accident of indexing. The `.nodecl` instances
  belong to the emit_mono lane, as #7139 found for its annotation sites.
- **The census's value-node writer is not built.** §3 item 3 planned a column on record
  literals and values checked against a declared destination. Its readers are the two
  type's-first-name sites that hold a value (C, D), and no program in the population reaches
  either with a type a second declaration shares. Built now, it would be a writer with no
  reader. It is built when a reader needs it.
- **`retStructRowIndex` reads the declaration, not the spelling.** It stays a row-by-name read
  until struct rows key by canonical type (`2026-11-10-step7-retkind-family.md`). Its name is
  now the checker's declaration, and the two names differ only at a plain alias.

## Proof

- Refresh ×2 is byte-identical at 6,619,700 bytes on base `94b382ce` (+192). Merged with master
  `6c985ea7` (#7161), it is a fixpoint at 6,619,984 bytes.
- `regress.vl`: no runs lost. `lint-self`: clean. Seed size: +0.5% on its baseline.
- The `sweep` label re-proves the population. Expected movers: none.
