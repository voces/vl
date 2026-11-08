# Step 7: post-mono-only classifier batch (r5), 2026-11-08

#6741 removed the pre-monomorphize `computeRetInference` run, and some classifiers stopped being
asked before monomorphize. Each one is checked against a typed reader. Three are deleted onto
their readers, and one that had lost its last caller is deleted too.

**Census** (`classifier-census.vl -- --callers`, 23,613 programs):

| tree | post-only | pre-only | both | probed |
| --- | --- | --- | --- | --- |
| `claude/step7-premono-askers` `0ef52cca` (#6741 before merge) | 18 | 1 | 85 | 104 |
| this PR, on master `756faab3` (#6738 merged) | 15 | 1 | 83 | 99 |

The before row does not include #6738, which deleted `letInitCellKind` and `letIsStringArray`.
That leaves `letInfStrListByUseV` uncalled on master. It was `both` on the before tree.

**Shadow.** A scratch compiler computes the old answer and the typed one at each call, and counts
each pair through `clsCensusEnter("SH <fn> agree|DIS <old>/<typed>")`. It runs as
`classifier-census.vl -- --compiler <shadow> --keep <dir>`. The counts are calls.

| classifier | typed reader | agree | disagree | outcome |
| --- | --- | --- | --- | --- |
| `cloRetIsStructRow` | `repOfTy(fnRecordedRetTy(fe))` is `struct`/`nulstruct` | 2,317 | 0 | deleted → `fnRetIsRecordRow` |
| `callIsMapFilter` (its `mfRecvKindOf` rung) | `tyIsArray(nodeTyAt(receiver))` | 974 | 0 | body typed |
| `forInVarIsLitAtom` | `rdAtom` of the element type's rep (a list's element, a map's key) | 6,161 | 0 | deleted → `forInVarRepIsAtom` |
| `cloRetValSlot` | `repSlotOfKind(rep kind, fnRecordedRetTy(fe))` | 66,737 | 814 | kept |
| `ifExprRefKindOf` | `repOfNode(if)` | 987 | 324 | kept |
| `mapValElemKind` | `repOfTy(tyMapValOf(nodeTyAt(map)))` | 727 | 10 | kept |
| `callLoweredKindOf` | `repOfNode(call)` | 9 | 20 | kept |

The first `forInVarIsLitAtom` shadow read only `tyStepElem`. Its 4 disagreements were all
`for e in m` over a literal-union-keyed map (`litunion-map-key-every-consumer.vl`,
`capture-walk-variable-coalesce.vl`). Reading the map's key closed them.

**Why the kept ones stay.**

* `cloRetValSlot`: 570 calls have kind `struct` against a recorded `closure`, which is a
  lambda's own result read as a function value. 130 are two record or variant answers whose
  rows differ. 114 are ref-list and map slots, which `repSlotOfKind` numbers in a different
  vocabulary (`2/-1`, `-4/-5`).
* `ifExprRefKindOf`: of the 324, 293 name a non-null kind where the type has its nullable twin
  (`str/nulstr` 131, `struct/nulstruct` 53, the lists and maps). 30 more are null against a
  kind (`i32`, `nulbool`, `v128`), and 1 is `struct/variant`. These were counted, not
  ablated, so whether the classifier or the type is right at each was not examined.
* `mapValElemKind`: 9 calls in `is-narrower-map-tests-values.vl` (`nulstr/str`) and 1 in
  `unannotated-list-of-closure-map-union-for-in.vl` (`closure/nulclosure`).
* `callLoweredKindOf`: on all 20 the old answer is null and the typed one names a kind, so the
  two differ on which calls the classifier covers.

`vkNonNullRefTwin` is a `VKind → VKind` table, not a classifier over a node. No typed reader
replaces it.

**The reader across the import graph.** `fnRecordedRetTy` (`fn_ret_shadow.vl`) imports
`emit_classify`. `emit_classify` therefore reads it through `fnRecordedRetTyFn`. `emitProgram`
installs it beside `elabDeliveredRowClassFn`, and a read before that traps.

**Proof.** Both seeds are fixpoints (two refreshes, byte-identical). Master `756faab3` is
6,492,294 bytes and the candidate is 6,492,242 (−52). The sweep compared base with candidate
over 23,613 programs: 23,613 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 new
traps. `emit_classify.vl` went from 15,949 to 15,906 lines (+32 / −75). Across the four files
it is +37 / −83.
