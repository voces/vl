# Step 7: classifier round 8, 2026-11-08

Round 8 shadows the five classifiers that became post-only when #6754 deleted the pre-mono
collectA run. It uses the r6 method (`2026-11-08-step7-classifier-batch2-r6.md`): a scratch
compiler computes the old and typed answers at every call and counts each pair through
`clsCensusEnter("SH …")`. Counts are calls over the 23,628-program census population.

**Census** (`classifier-census.vl`, no `--callers`):

| tree | post-only | pre-only | both | probed |
| --- | --- | --- | --- | --- |
| master `2150af91` (fixpoint seed) | 21 | 0 | 70 | 91 |
| this PR | 20 | 0 | 70 | 90 |

**Shadow 1: the classifier against a typed reader.**

| classifier | typed reader | agree | disagree | outcome |
| --- | --- | --- | --- | --- |
| `arrNewNamedKind` | `repOfNode(call).rdKind`, a list backing | 367 | 0 | deleted → `arrNewRepKind` |
| `popRefRecvSlot` | receiver rep `reflist`, slot `rlSlotOfTyOrTwin` | 19,761 | 3 | body typed (shadow 2) |
| `compositionMapReadSlot` | `mapShapeOfTyPeeled(nodeTyAt(read))` | 10,491 | 257 | Index arm typed (shadow 2) |
| `letInitNarrowedAtomKind` | `readAtomKindOfTy` of the init's type | 4,781 | 84 | kept |
| `arrLitIsF32` | `repOfNode(literal)` is `f32list` | 69,286 | 96 | kept |

**Shadow 2: only the type-blind gate.** In both slot classifiers the type-blind part is the
`exprRefArray` gate; the slot comes from `refListSlotOfExpr`, a recorded row. The gate read
against `nodeRepIs(recv, "reflist")` agrees on all 1,159 `popRefRecvSlot` calls. In
`compositionMapReadSlot`'s list-of-maps arm, the same gate and the element's map kind (now
`repOfNode(read)`) agree on all 9,062 calls. The 3 slot disagreements in shadow 1 are
`xs.pop()` over a list built wider than its element (`built-map-read-literal-default-binding-runs.vl`,
D15230). There the recorded row is J's, and no type keys it. The nested-map arm keeps its mv-slot
readers, which are not classifiers.

**`arrNewNamedKind` and its three sources are gone.** The fill ladder, `arrNewDestKind` and
`arrNewFillAnnKind` answered for a monomorphized body whose call type was still `T[]`. After
mono the call's recorded rep names the backing, at all 367 calls. `arrNewKindOfListVKind`
already mapped that rep, and `arrNewKindOfElemVKind` and `tyIsRefListElemTy` lost their last
callers.

**Why the kept ones stay.**

* `arrLitIsF32`: 86 calls are an empty literal (`const g: f32[] = []`) that types `f32[]`, and
  the classifier answers false because the literal has no f32 elements. The other 10 are true
  against `list`/`reflist`/`f64list`/`i32`, as in `const xs: f32[] = [1]`
  (`f32-contextual-integer-literal.vl`): the literal's recorded type is `i32[]`, but the
  contextual-width read says f32. The missing fact is the literal's contextual element width.
* `letInitNarrowedAtomKind` (82 `-3/0`, 2 `-3/2`): numeric literal-union inits, where the type
  is an atom but the read is not union-stored, so `identReadAtomKindAt` declines. It is a
  dispatcher over `identReadAtomKindAt`, which is already a typed reader.

**`readCellKind` (item 2) is not switched.** Of its code-15 (`FC_STRUCT`) Member reads, the
read's own rep is `struct` 2,640, `variant` 324, `nulstruct` 321 and `nulvariant` 244. A
storage-type fact would rep the 568 variant reads as `nulvariant`, but the classifier answers
`nulstruct`. `readOwesNonNullRecover` would then flip for them (twin `variant` matches the
read). So the vocabulary needs a decision before the fact is recorded. Field codes are written
at about ten sites in five files (`sFieldTypes`/`armStageTypes`), so recording a storage type
there is its own PR.

**Proof.** Both seeds are fixpoints. On master `2150af91` the base is 6,509,473 bytes and the
candidate 6,507,662 (−1,811). The sweep compared them over 23,628 programs:
23,628 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 new traps. Export budget:
0 dead exports.
