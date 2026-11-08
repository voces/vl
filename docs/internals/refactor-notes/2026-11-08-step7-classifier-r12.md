# Step 7: classifier round 12, the post-only shadows, 2026-11-08

Round 12 shadows the post-only classifiers r11 left (`2026-11-08-step7-classifier-r11.md`) on
master `7e02b057` with #6809 merged, and deletes the ones that agree. Counts are calls over the
23,662-program sweep population. Shadows are r6's method (`clsCensusEnter("SH …")` in a scratch
compiler, read from `classifier-census.vl --keep`); an agreement is split by answer, so a reader
that only ever answers "no" cannot pass.

**Shadows.**

| classifier | typed reader | agree | disagree | outcome |
| --- | --- | --- | --- | --- |
| `exprNulStrArray` | element of `nodeTyAt` (peeled of `null`) is `string \| null` | 232,137 (944 true) | 0 | body typed |
| `capturedRefListSlot` | `repSlotOfKind` of the type the parent binding holds, at a ref-list kind | 11,724 (124 slots) | 0 | body typed |
| `letRefListElemName`, both sites | `rlElemName` at `repSlotOfKind` of `letBindTy` | 134 (62 names) | 0 | body typed |
| `refListElemKind` | its body already reads the list's type at the instance | — | — | moved to `emit_ty_canon.vl` |
| `letIsNulString` | `repSigKindOfTy(letBindTy)` is `nulstr` | 150,244 | 3 | kept |
| `forInPairElemKind` | `repSigKindOfTy(forInBindTy(iterable type, true))` | 8,212 | 2 | kept |
| `mapValElemKind` | `repSigKindOfTy` of the map type's value | 708 | 9 | kept |
| `forInElemKind` | `repSigKindOfTy(forInBindTy(iterable type, false))` | 61,942 | 141 | kept |
| `forInVarStructIdx` | `repSlotOfKind` of the same type | 8,271 | 20 | kept |
| `captureValStructIdx` | `repSlotOfKind` of the parent binding's type | 8,162 | 66 | kept |
| `cloPinnedListElemKey` | interned `sigKeyOfTy` of the list type's element | 1,334 | 142 | kept |
| `cloArrElemSelfKey` | the same | 1,293 | 79 typed-empty, 2,661 typed-only | kept |
| `cloValueCallRetKind` | `repSigKindOfTy(nodeTyAt(call))` | 3,258 | 57 | kept |
| `letCellSlot` | `repSlotOfKind(k, letBindTy)` | 215,067 | 744, 479 of them map shapes | kept |

**`letRefListElemName`'s 72.** r11's existence-site count compared against `letRefListElemTy >= 0`.
All 72 have the old name `""` while `letRefListElemTy` finds an element. The binding's rep kind
agrees on all 134, so that comparison used the wrong reader. `letRefListElemTy` stays as
`letTailRowSlot`'s reader, and its comment no longer claims it shares a source with the name.

**The classes the kept ones need**, from the programs each disagreement comes from:

* `mapValElemKind` and `forInElemKind` `nulstr/str` (8 each): `is-narrower-map-tests-values.vl`.
  The map was narrowed by `m is {[string]: string}`, and the cell still holds the wider value. The
  typed reader read the narrowed type. A value-testing narrowing keeps the storage rep, and a
  narrowing out of a union box (the classifier's first rung, D1015) does not. The missing fact is
  which of the two a narrowed read is. `readNarrowedStoreAt` has the storage type but not the
  difference.
* `forInElemKind` `i32/nulbool` (126): a `(boolean | null)[]` iterable whose list is built as a
  plain boolean list (`spread-boolean-list-into-nullable-boolean-list.vl` and three generic pins).
  The missing fact is the built element rep of the list a destination retypes.
* `letIsNulString` (3): an `if` join at a generic pin (D3290) and a null hole filled by a write.
* The key and slot readers disagree in direction and vocabulary (map shape numbering, a lambda
  literal's own key). They were not ablated this round.

**`mfStructResultRowName` is uncalled.** Its only program, `list-eq-every-rep.vl`, reached it through
`letRefListElemName`'s initializer rung (`refListElemNameOfExpr`), which the typed body no longer
asks. The function still has a caller, and no program in the population reaches it.

**Census** (`classifier-census.vl`, no `--callers`):

| tree | post-only | pre-only | both | uncalled | probed |
| --- | --- | --- | --- | --- | --- |
| master `7e02b057` with #6809 | 32 | 0 | 53 | 0 | 85 |
| this PR, same base | 27 | 0 | 53 | 1 | 81 |
| master `c29a215e`, this PR's probe set | 28 | 0 | 53 | 0 | 81 |
| this PR merged with master `c29a215e` | 27 | 0 | 53 | 1 | 81 |

**Proof.** Both seeds are fixpoints: master `c29a215e` 6,514,920 bytes, this PR 6,514,204 (−716).
Sweep over 23,664 programs: 23,664 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`,
0 new traps. `scripts/gate.sh` on the final tree: all 23 rows pass.
