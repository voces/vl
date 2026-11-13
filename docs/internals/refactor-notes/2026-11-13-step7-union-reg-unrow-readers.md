# Step 7 L6 (lane G, cut 10a): the `unRowOfName` readers, graded; three removed, 2026-11-13

The base is master `ad113118`. `unRowOfName` had 12 readers. This is the decision table for each,
and the three this cut removes.

| reader | what it reads the spelling's row for | decision |
| --- | --- | --- |
| `boxDstName` (wasmEmit) | to keep a caller's spelling when it names the row the type keys | **removed**: the row's registered name answers. Since 6a every box-path caller passes `boxTyName` or a typed name, and 8a/9a's same-row respellings moved nothing |
| `registerValueUnionNameAB` (emit_union_atoms) | the armed A/B tally only | **removed**, as in 7c |
| `isUNameDeclAB`, second line | the armed A/B tally only | **removed** |
| `isUNameDeclAB`, no-type rung | a spelling that is no declared type (`nameIsStructDecl`, lane F's file) | next cut |
| `unionMemberSetOf`, `unMemRowOfName` | name-query entries behind `unionMemberAtomsOf`, `unionSetAtomsOf`, `msSetOfUnion`, `unionArmsOfSetTy`, `unionNameNonNullCountTy` (lane A's slice), and `isValueUnionOfSet` / `unionCarriesLitUnionArm` / `unionArmMemberTys` | next cut, after lane A's `unionSetAtomsOf` work |
| `unionArmTys`, `unionArmTysOfTy` | a member list by spelling | lane A's current slice |
| `unionRowOf` | the registry A/B sweep (`unABKindName`, `unionRegistryABSweep`) and `unionMemberTysOf` | instrument, plus one query entry (next cut) |
| `unTyKeyShadow` | the type-key shadow, armed only (`unABOn`) | an instrument that compares the spelling's row with the type's by design; it stays |
| `unNameBound`, `unNameShareTyKeyRow` | registration: bind a source spelling to the row its type found | the spelling-index contract (a source name resolves to its row); stays |

## Changed

The three removals above. Unarmed, the emitted program is unchanged except where a caller passed
a spelling of the type's row other than its registered name; `boxDstName` now always answers
the registered name.

## Proof

- **Seed:** fixpoint, before and after merging master.
- **Locally:** lint-self, regress (no runs lost), rep-fuzz (exact), check-filed-witnesses `--strict`
  (4,866 graded, 0 moved), late-demands (8, baseline 8), seed-size (+1.8%), and the comment,
  ladder, sentinel and scan budgets.
- **The full sweep:** CI's `sweep` label.
