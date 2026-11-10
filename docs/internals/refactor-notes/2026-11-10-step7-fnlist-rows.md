# Step 7: classifier group 3's list-row ladders move to `listRowOfExpr`, 2026-11-10

Group 3 of `2026-11-09-step7-classifiers-remaining.md` is function-value list rows. This PR takes
`refListSlotOfExpr`, `refListKeptSlotOfExpr` and `letTailRowSlot` off the probe set, on master
`775f38bf`. Probed classifiers go from 19 to 17 there, and from 17 to 15 once merged over #7069. Those three leave, and one residual (`refListSlotOfUntyped`, 225 calls in 40 files) is probed in their place.

**The literal's own row.** `listRowOfExpr` now answers a ref-list literal whose type keys no row.
That is a function-value list at a hole or a set (`[inc0, dbl]`), which `exprRepTy` gives no row.
It reads the row the intern pass minted the literal's elements at (`arrLitRlSlotAt`). Where there
is none, it reads the row the literal is built at when its type keys none, `arrLitRowSlotIn`, the
row `emitArrRef` takes in that case. That is a pure read, so the sibling table written in `emitArrRef`
was tried and dropped. Such a table answers only after the literal is emitted, and
`letRefListSlot` asks before. The minted row is not read for a literal typed over a declared type
parameter (`tyNamesDeclaredParam`, a walk on `tyIsDeclaredParam`). There, the intern pass's row is
the template's (`((U) => void)[]`), not the instance's. `tyHasTyVar` would refuse every hole-typed
literal too. Over the sweep population the minted row answers 12,533 calls in 156 files and the
built row 608 in 39.

**The ladder, rung by rung.** Each rung's return was tagged, and the census was run on the
23,836-program population before the literal arm was added. Where `listRowOfExpr` missed, the
ladder was entered 19,417 times:

| node | rung that answered | calls | the type's row agrees |
| --- | --- | --- | --- |
| identifier | the local's cell (`declaredRefArraySlot`) | 7,267 | 6,849 |
| identifier | the global's cell (`letRefListSlot`) | 7,263 | 6,216 |
| identifier | a parameter or a narrowed arm: the type | 1,000 | all |
| call | the callee's recorded result | 1,711 | 1,694 |
| list literal | the literal's own or minted row | 660 | 408 |
| field read | the receiver row's field slot | 476 | 401 |
| index read | the receiver row's element row | 270 | 222 |

Every other row is under 200 calls. A binding's cell row and a field's slot are where the emitter
stores the value. By DECISIONS.md §"How step 7's classifier half finishes", they are STORAGE, so
they stay. The new `refListCellSlotOfRead` is in the census's `STORAGE_READERS` with its reason.
Everywhere else, the only rung that answers something the type's row does not is a value whose
type keys no row.

**What `refListSlotOfExpr` reads now.** In order: the rep row (`listRowOfExpr`). Then the read's
storage: the binding's cell, the field's slot, or the receiver row's element row. Then the type's
row. Then `refListSlotOfUntyped`: a value `if`'s join, a call's recorded result, or a spread
literal's minted row. Shadowed against the old ladder, it agrees at 19,909 of 19,911 calls. The 2
are in `closures/nullable-closure-array-scalar-union-result.vl`. There, every identifier rung
missed and the ladder answered -1 without asking the type; the type's row 0 answers now. The
file's wasm is byte-identical. `letTailRowSlot` is folded into `letRefListSlot`, with the same
arms and no probe. Its calls had fallen from 8,749 to 2,886 once the literal row answered first.
`refListKeptSlotOfExpr`, `refListKeptSlotOfIdent` and `arrLitKeptRowSlot` are deleted.

**Wasm.** 932 files reach a changed path: either the new literal arm answers, or
`refListSlotOfExpr` passes its rep row. All 932 build byte-identical wasm against master's source
built by the same seed. The 17 that fail, fail alike. One is D15372's invalid module, whose bytes
are identical. A first comparison against the fetched `seed-latest` showed 12 differences. Those
were the seed, which is not master's fixpoint, so a baseline is master's source built by the
candidate's own seed.

**Proof.** The fixpoint seed is byte-identical over two `refresh-compiler.sh` runs: 6,601,963
bytes, and 6,600,575 merged over #7069, where the 932 reached files are again byte-identical. Seed size is +0.2%. Late demands are 6, the baseline. rep-fuzz is exact, and lint-self is
clean. The `cases_wasm` shards pass 7,402 with 0 failing. `check-filed-witnesses --strict` grades
all 4,686 rows as filed. `vl_scaling_shape_test.ts` passes.
