# Step 7: three of classifier group 3's rest leave the probe set, 2026-11-10

Group 3 of `2026-11-09-step7-classifiers-remaining.md` is function-value list rows. It was shadowed on master `34f46a82` and is
merged over `81037c5e`, where probed classifiers go from 7 to 4 (`classifier-census.vl`, 23,842
programs). `mfResultSlotOf` and `arrLitObjRowTy` are lane w278's.

Each classifier was shadowed with `clsCensusEnter("SH …")` against its candidate twin, and the
census was kept (`--keep`). A count below is post-mono calls (files).

| classifier | twin | agree | disagree | outcome |
| --- | --- | --- | --- | --- |
| `cloArrCallRetKind` | the result of `cloCallSigKey`, the key the call is lowered with | 2,742 (an `Index` callee) | 215 (49), where the old body answered `null` | switched; the 215 build byte-identical wasm |
| `cloPinnedListElemKey` | the members of the callee type's tagged set | 279 | 28 (10) | the rung is deleted |
| `refListSlotOfUntyped` | none: every answer is storage or a record | 25 answer (12), 4,703 miss | — | `STORAGE_READERS` |

**`cloArrCallRetKind`.** It asked the call's pinned read type, then the list row's stored
signature, then `cloCallSigKey`. Now an indexed callee answers the result kind of
`cloCallSigKey`, which is the functype the `call_ref` casts to. Where the body agreed it was
already this answer. The 215 disagreeing calls are lists of a tagged set's ids (`const xs = [id]`
over a generic), which the old body called no ref list and answered `null`. Every one of their 49
files builds byte-identical wasm. It is in `STORAGE_READERS` with that reason.

**`cloPinnedListElemKey`.** Every one of its 307 hits is a tag call (`fnTagCallArms` non-empty) over
a list of a set's ids, never a ref list. Its typed twin, the shared key of the members of
`fnTagSetOfTy(callee)`, agrees at 279. Switched in, it also answers where the walk missed, and that
turns 15 programs into invalid modules (`listed-hole-fn-called-at-two-types.vl`). Deleting the
rung builds byte-identical wasm in all 1,489 files that reach `cloCallSigKey`'s indexed rungs.
The key fed no lowering, so it is deleted rather than replaced. D6831's fixture
(`hole-fn-from-two-element-list-concrete.vl`) is among the 1,489.

**`refListSlotOfUntyped`.** It is reached only after the rep row, the read's storage and the type
have each missed. It answers 25 calls in 12 files. Each answer is where the value is stored or
recorded: the local a value `if` joins its arms into, the callee's recorded result row, or the row
the intern pass minted a spread literal at. It is in `STORAGE_READERS` with that reason.

## Left in group 3

| classifier | why it stays |
| --- | --- |
| `cloArrElemSelfKey` | Deleting it breaks 6 files: 2 niche signatures (D2552, `niche-signature-value-call.vl` traps) and 4 capture cells, whose minted read `d[0]` has no type. The callee type's key agrees wherever it renders one (394 of 439). Put first, it moves 36 calls in 5 other files. The fact it needs is the lambda's own key on the row the literal is minted at. |

## Proof

The fixpoint seed is 6,597,863 bytes over `81037c5e`. Two `refresh-compiler.sh` runs are
byte-identical.

* The 1,489 reached files build byte-identical wasm against master's source built by the same
  seed. 4 fail, and they fail the same way on both.
* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.1%.
* `late-demands --check`: 6, the baseline.
* Dead-export budget: 0.
* `cases_wasm_*`, `budget_pin_helper`, `vl_cls_census`, `vl_inventory_refs`, `vl_inventory_rows`,
  `vl_probe_rollback`, `vl_scaling_shape`: 7,513 passed, 0 failed.
* `check-filed-witnesses --strict` on both inventories: 4,689 as filed, 0 moved, 0 output
  mismatch.
