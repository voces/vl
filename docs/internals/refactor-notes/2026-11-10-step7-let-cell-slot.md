# Step 7: `letCellSlot` and `captureValStructIdx` read the binding's storage, 2026-11-10

Group 7 and group 11 of `2026-11-09-step7-classifiers-remaining.md`, under the ruling in DECISIONS.md
§"How step 7's classifier half finishes": a classifier that reads the emitter's own storage stays,
moving to `NOT_BLIND` with its reason. Base is master `e860b760` (#7070), fixpoint seed 6,601,153
bytes. Counts are post-mono calls over the 23,838-program sweep population.

## `letCellSlot`, shadowed per arm

`letCellSlot` is the slot beside a binding's cell, which `emit_collect` declares the local with
(`addLocalSlot(k, letCellSlot(...))`) and `emitGlobalSection` writes the global at. A scratch
compiler tagged each call with the arm that answered and compared it with
`repSlotOfKind(k, letBindTy)`, the slot the binding's type gives. The shadow ran on #7069's head, where
`structIndexOfExpr` already read storage, then rep.

| arm | calls | same as the type's slot | layout twin | different |
| --- | --- | --- | --- | --- |
| the rep claims the cell (`letBindRepSlot`) | 202,386 | 202,214 | 136 | 36 |
| reflist (`letRefListSlot`) | 14,323 | 14,270 | | 53 |
| map (`letMapShapeOfTy`) | 8,012 | 7,880 | | 132 |
| holder bundle record (`holderRecordRow`) | 149 | | | 149 |
| `nulnone`, `nulreflist`, `variant`, `nulstruct` | 84 | 84 | | |
| struct (`structIndexOfLet`) | 17 | 16 | | 1 |

* **The rep-claims arm** is the binding storage column (D14434): the rep and its row, kept per
  binding and instance where the cell is filled. Its 36 differences (35 `nulstruct`, 1 `struct`)
  are the claiming rep's slot against the type's, which the cell is declared with.
* **The reflist, map and holder arms** read what the builder recorded: a list's stored row
  (`listRowOfExpr`, #7070), a map built from a record solve (`recBuildElemTyOf`), and the
  returned-bundle ledger. These are the rep records the ruling keeps where the emitter computes them.
* **The struct arm** reads the annotation's row, else `structIndexOfExpr` of the initializer.
  Since #7069 that reads storage, then rep. Its one difference is
  `soundness/fresh-literal-at-generic-delivered-wider-runs.vl`: `const r = back(a)` is stored at
  `V`'s row, which only the callee's published join knows. That is group 9, checker work.
* **The variant arm** (1 call) is a literal's variant row, the row it is built at.

No arm reads a name or a spelling. `letCellSlot` moves to `STORAGE_READERS`.

## `captureValStructIdx`

It names the env field's slot. A captured `let` takes `letCellSlot` in the frame that declares
it, a loop variable takes `forInVarStructIdx` or `forInPairStructIdx`, and a parameter takes its
annotation's slot. It is the companion of `captureValKind` and `capturedKindOf`, both in
`NOT_BLIND` since round 25. It moves to `STORAGE_READERS`.

## Change

Both probes are removed. The census lists both under `STORAGE_READERS` with their reasons. No
classifier answer changes.

## Census (`classifier-census.vl`)

| tree | probed | calls |
| --- | --- | --- |
| master `e860b760` | 14 | 2,350,920 (`letCellSlot` 224,967, `captureValStructIdx` 15,211) |
| this PR | 12 | 2,110,742 |

## Proof

| check | base | this branch |
| --- | --- | --- |
| fixpoint seed | 6,601,153 | 6,601,049 (−104) |
| sweep, 23,838 programs | | 23,838 same bytes |
| `rep-fuzz-check.sh` | | exact, 0 baselined failures |
| `seed-size.vl --check` | | +0.2% of baseline |
| `late-demands.vl --check` | 6 | 6 |
| `check-filed-witnesses.vl --strict`, both inventories | | 4,686 graded, 4,686 as filed |
| `cases_wasm` 0–3, inventory refs/rows, `vl_cls_census`, `vl_scaling_shape` | | 7,503 passed, 0 failed |
| `lint-self.sh` | | clean |
