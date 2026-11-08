# Step 7: classifier batch 2 and the disagreement classes (r6), 2026-11-08

Batch 2 of the post-mono-only classifiers, shadowed the way r5 did it
(`2026-11-08-step7-classifier-batch-r5.md`): a scratch compiler computes the old answer and a
typed one at every call and counts each pair through `clsCensusEnter("SH …")`. Counts are calls
over the 23,615-program census population.

**Census** (`classifier-census.vl`, no `--callers`):

| tree | post-only | pre-only | both | probed |
| --- | --- | --- | --- | --- |
| master `691fde26` | 24 | 1 | 74 | 99 |
| this PR | 19 | 1 | 73 | 93 |

`vkNonNullRefTwin` leaves the probe set: it is a `VKind → VKind` table, not a classifier.

**Batch 2.**

| classifier | typed reader | agree | disagree | outcome |
| --- | --- | --- | --- | --- |
| `listFitArmTestIn` | receiver `nodeTyAt` is a `TyArray` | 19,043 | 0 | body typed |
| `refListElemIsRow` | `repOfTy` of the list type's element | 739 | 0 | deleted → `listElemRepIsRow` |
| `letDeclIsClosureNoLocal` | `tyIsFuncType` of the annotation, else of the init | 9,709 | 0 | body typed |
| `retCapturedMapShape` | `repOfNode` of the captured read, `map` → `rdSlot` | 110 | 0 | body typed |
| `identBindingNulStrList` | the binding's `nodeTyAt`, element rep `nulstr` | 107,127 | 0 | body typed |
| `readCellKind` | `repOfTy` of the read's storage | 440,744 | 14,351 | kept |
| `bindingIsLitAtom` | `nodeRepIsAtom(binding)` | 344,709 | 285 | kept |
| `armIsNulNone` | `isNullTy`/`isNeverTy` of `nodeTyAt` | 5,337 | 30 | kept |
| `arrLitObjRowTy` | `repOfTy` of the element, `struct`/`variant` | 6,426 | 7 | kept |
| `mfStructResultRowName` | `repOfTy` of the result element | 13 | 3 | kept |
| `mfResultSlotOf` | `repOfNode(call)` `reflist`, slot by element | 2,492 / 4,078 | 2,006 / 420 | kept |
| `cloRetKeySuffix` | `repSigRetTokOfTy(fnRecordedRetTy(fe))` | 57,705 | 545 | kept |

Why the kept ones stay, by the program each disagreement needs:

* `readCellKind`: every disagreement is the Member arm. A code-15 field is stored nullable
  whether it is declared `S` or `S | null` (2,516 `nulstruct/struct`, 568 against a variant), and
  a field whose storage is no nullable niche answers null (the other 11,267). The classifier is
  right; the missing fact is a field's STORAGE type, produced today by `memberFieldCode`.
* `bindingIsLitAtom` is already a dispatcher over readers: its `LetDecl`/`LoopVar` arm reads the
  binding cell's rep (`letBindIsAtom`). The 285 are loop variables under a narrowed `K[]` arm
  (`for-over-atom-list-arm-of-box-union.vl`), where the cell rep is right and the node rep is not.
* `armIsNulNone`: a never-filled infer-null hole (D1576, `infer-null-hole-never-filled.vl`) reads
  as `null` to the classifier and has no `null` type in the arena. Missing fact: the hole's type.
* `mfResultSlotOf`: the rep claims `reflist` on calls the classifier declines, and the reverse,
  with either slot reading. Not one class; parked.
* `cloRetKeySuffix` follows `cloRetValSlot` (below): 330 of its 545 are `>sN;` against `>c`.

**The disagreement classes** (shadow 2, one build):

* `ifExprRefKindOf`: the classifier answers the join's HEAP kind, never a nullable one, because
  `emitIfExprRef` derives the join's null itself (`ifLinkYieldsNull`). So the 293 nullable-twin
  disagreements are vocabulary, and the classifier's is the one the emitter needs. Projected
  through `vkNonNullRefTwin` the count falls 324 → 166: 131 `str/nulstr` (the twin table does
  not pair strings), 30 a scalar join the classifier answers null for (`i32`, `nulbool`,
  `v128`), 3 `struct/variant`, 2 uncovered. A reader that projects strings and answers null for
  a scalar leaves 5 calls.
* `cloRetValSlot` (820): 570 are `struct:N` against `closure:-1`, so `fnRecordedRetTy` records
  the lambda's own function type where its result is a record. The classifier is right; the
  missing fact is the lifted lambda's RESULT type at `fnRecordedRetTy`.
* `callLoweredKindOf` (20): the typed answer is a nullable kind on 17 (`nulreflist`, `nulstr`,
  …), so the classifier covers only non-null results. Vocabulary, not a wrong answer.
* `mapValElemKind` (9): 8 `nulstr/str` in `is-narrower-map-tests-values.vl`, where the map's
  vals slot is nullable (`mvSlotNullable`) while its value type is not. The storage is right.

Not reached in this lane: `moduleCopySigKey` and `letIsNulString` (D3290).
