# Step 7: `cloArrElemSelfKey` is deleted, and no classifier is probed, 2026-11-10

`cloArrElemSelfKey` was the last probed classifier on master `deea236c`. It walked from an
indexed callee (`fs[i]`) back to the list literal, through the binding's body if needed, and keyed
the call by the lifted key the literal's lambdas share. It is deleted with its two walk helpers
(`cloArrLitOf`, `cloArrBindingLitOf`). `cloIndexCalleeSigKey` now answers from the instance key,
then the slot's key, with two new rungs. The probe count goes from 1 to 0.

## The shadow

`clsCensusEnter("SH …")` rows in `cloIndexCalleeSigKey` compared the walk's key against the
callee type's key (`sigKeyOfTy`, interned), against `nodeTyAt` at the instance, and against the
rest of the ladder. Census over 23,842 programs (`--keep`). The probe fired at 3,495 calls in 394
files. The walk answered at 437 of them; the rest are calls where it answered "".

| twin, where the walk answers (437 calls) | agree | none | differ |
| --- | --- | --- | --- |
| the callee's arena type key | 392 (57 files) | 45 (4) | 0 |
| the rest of the ladder | 376 (56) | 45 (4) | 16 (2) |

| typed key against the rest, where the walk answers "" (3,058 calls) | calls (files) |
| --- | --- |
| agree | 2,464 (305) |
| the type keys nothing | 568 (49) |
| the rest answers nothing | 24 (4) |
| differ | 2 (1) |

A typed key put first, as the previous lane found, is not sound. In
`hole-fn-inline-and-annotated-list-one-param-reached.vl`, `early(a)` is called with `[inc0]` and
with an `i64` list. At the `i64` instance the read's type is still `(i32)=>i32` while the slot
stores `(i64)=>i64`. The build fails with "a function value is called at two signatures". This
happens with the arena type and with `nodeTyAt`, and with the type gated on having no hole.

## What each disagreement needs

The two niche files (`niche-signature-value-call.vl`, `lambda-niche-signature-per-instance.vl`,
D2552) read a slot whose element type is re-read from its name, `(string)=>LI`. The name spells
the literal union `LI` by its string, so the slot keys `S>i`. The read's own type has the same
emit name and keys `i>i`, the lambda's functype. The new rung `slotTwinReadSigKey` takes the
read's type key only where the read's type and the slot's type are distinct types with one emit
name. In the hole-fn file the names differ (`(i32)=>i32` against `(i64)=>i64`), so the slot
answers there, as before.

The four capture-cell files (`captured-cell-hole-lambda-seed-in-generic-body.vl`,
`capture-cell-hole-lambda-seed-flipped-in-generic-body-at-two-types.vl`, D3971, D15101) call
through a minted `k[0]` that has no type at the un-coerced instance, and the hole cell's slot keys
nothing. The cell is emitter storage: a one-element list built holding its seed lambda, and mono
coerces every write to the seed's type (`monoCoerceWrittenCell`). The new last rung
`cellSeedSigKey` reads the seed's lifted key off the `let` the frame's slot declares
(`bindingDeclInScope`). That is a declaration link, not a body walk. `identDeclOf` alone names the
template's `let`, whose seed keys `>v`. The rung is in `classifier-census.vl`'s
`STORAGE_READERS` with that reason.

## Proof

The fixpoint seed is 6,596,961 bytes. Two `refresh-compiler.sh` runs are byte-identical.

* The 394 files that reach the deleted classifier build with master's source and with this
  branch's, each built by the same seed. 391 build byte-identical wasm. 3 (D14401, D14437,
  D15194) fail the same way on both.
* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.1%.
* `late-demands --check`: 6, the baseline.
* Dead-export budget: 0.
* `cases_wasm_*`, `budget_pin_helper`, `vl_cls_census`, `vl_inventory_refs`, `vl_inventory_rows`,
  `vl_probe_rollback`, `vl_scaling_shape`: 7,512 passed, 0 failed.
* `check-filed-witnesses --strict` on both inventories: 4,689 as filed, 0 moved, 0 output
  mismatch.

`vl run scripts/classifier-census.vl` on the fixpoint seed:

```
classifier-census: 23842 programs (all, shard 1/1), 0 probed classifiers, compiler /home/user/vl/build/vl-compiler.wasm
post-only     0
pre-only      0
both          0
uncalled      0

fn                              class       files      pre   during     post  top pre callers
```
