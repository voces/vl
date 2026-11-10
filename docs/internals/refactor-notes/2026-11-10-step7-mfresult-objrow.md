# Step 7: `mfResultSlotOf` reads the call type's row; `arrLitObjRowTy` is a storage reader, 2026-11-10

Group 3 of `2026-11-09-step7-classifiers-remaining.md`. Base is master `ad4c2d0d`, whose
compiler is 6,599,022 bytes. Counts are post-mono calls over the 23,842-program sweep population.

## `mfResultSlotOf`

Its `.map` arm already answered from the call's type (`nodeTyInOf`), and its `.filter`/`.slice`
arm from the receiver's slot (`refListSlotOfExpr`). Every other call returns -1 at a gate. Most
of its 4,474 calls take the `.map` arm or a gate; the `.filter`/`.slice` arm is reached 157 times
in 52 files.

| twin at the `.filter`/`.slice` arm | agree | none | disagree |
| --- | --- | --- | --- |
| the call's rep row (`listRowOfExpr(callIx)`) | 127 | 30 | 0 |
| the call type's element row (`rlSlotOfTyOrTwin`) | 144 | 13 | 0 |
| the receiver's rep row | 130 | 27 | 0 |

**Switched:** the arm answers the call type's row. Where the type keys no row, as for a
hole-function list, the result is built at its receiver's row, and the arm reads that, as
before. No twin disagrees at any call, so the answer is unchanged at every call. The 52 files
build byte-identical wasm.

`classifier-census.vl` decides blindness from text tells (`rep-classifier-census.vl`'s
`ARENA_TELLS`). `nodeTyInOf(` is now one: it is `nodeTyIxOf` elaborated in a frame. The added
tell reclassifies 9 functions. In `emit_classify.vl` they are `mfResultSlotOf` and five that were
already `NOT_BLIND` or storage readers (`exprIsStrConcat`, `capturedRefListSlot`,
`armFieldUnionName`, `coalTyIsStr`, `popRefRecvSlot`). The other three are outside the census's
file. No other probed classifier moves.

## `arrLitObjRowTy`

The row type `arrLitRowTyIn` keys an object-literal list by: the lead record literal's struct
row (`structIndexOfObjCtx`), else its arm's row (`objVariantRowCtx`). `structIndexOfObjCtx` is
the row `emitObj` builds a record literal at when no container hands it one. So this classifier
reads the emitter's own storage for the lead element. By DECISIONS.md §"How step 7's classifier
half finishes", it goes to `STORAGE_READERS` with that reason. Its probe is deleted. The code is
unchanged.

The typed twin agrees at 79 of the 85 calls that pass its gates: the lead's recorded rep, by its
struct row, else by `litArmRowOf`. The 6 that differ are the joined-set function-list records
(D15561, `returned-lists-of-records-take-the-joined-set-runs.vl`,
`returned-bound-list-of-records-beside-a-joined-literal-runs.vl`,
`list-of-tagged-records-handed-to-a-generic-call-in-an-instance-runs.vl`). There an instance
builds the literal at the tagged-set row (`sLitIdRow`), and the type does not name that row.

## Census (`classifier-census.vl`)

| tree | probed |
| --- | --- |
| base `ad4c2d0d` | 9 |
| this PR | 7 |

**Proof.** The fixpoint seed is 6,598,948 bytes (−74), byte-identical over two
`refresh-compiler.sh` runs.

* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.2%.
* `late-demands --check`: 6, the baseline.
* Dead-export budget: 0.
* `cases_wasm_*`, `vl_cls_census`, `vl_inventory_refs`, `vl_inventory_rows`, `vl_probe_rollback`,
  `vl_scaling_shape`, `vl_ladder_census`: 7,512 passed, 0 failed.
* `check-filed-witnesses --strict` on both inventories: 4,689 as filed, 0 moved, 0 output mismatch.
