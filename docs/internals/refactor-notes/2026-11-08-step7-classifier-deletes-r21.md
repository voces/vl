# Step 7: classifier round 21, eighteen shadows and three deletes, 2026-11-08

Round 21 starts from master `e6220320` with #6892 merged in, where `classifier-census.vl` reads 69
probed, all post-only. It uses the round-20 method: a scratch compiler wraps each classifier, runs it
and a typed twin, and counts `SH <fn> =` or `SH <fn> <legacy>/<typed>` under `$VL_CLS_CENSUS=1`
over the 23,728-program sweep population (`--keep`, about a minute a run at `JOBS=4`).

**Shadow** (post-mono, calls; the twin is `repOfNode` of the node's recorded type unless named):

| classifier | typed twin | agree | disagree |
| --- | --- | --- | --- |
| `armIsNulNone` | `nodeRepIs(v, "nulnone")` beside the null/never literal tests | 1,658 | 0 |
| `callResultIsLitAtom` | `nodeRepIsAtom` | 33,464 | 0 |
| `callStoreListKind` | the node rep's kind when it is a list kind | 66 | 0 |
| `calleeReturnsStructIdxOfRead` | `sigKeyOfTy(nonNullTy(read ty))`'s struct slot | 34,506 | 20 (`0/-1`) |
| `exprIsClosureNoLocal` | `closure` or `nulclosure` | 156,211 | 56 (F/T) |
| `nulVariantIdxOfExpr` | the `nulvariant` rep's slot | 956,025 | 1,978 |
| `calleeRetKindOfRead` | `sigKeyOfTy(nonNullTy(read ty))`'s result | 215,301 | 7,234 (kind/null) |
| `unionIdentReadKind` | `union` → -2, else -3 | 537,642 | 4,064 |
| `exprUnionCall` | `nodeRepIs(·, "union")` | 170,462 | 9 |
| `cloRetKindOf` / `cloRetValKind` / `cloRetValSlot` | `repOfFnSlot(fe)` | 189,231 / 408,591 / 51,195 | 7,497 / 16,210 / 3,571 |
| `globalReadStructIndex` | the `struct`/`nulstruct` slot | 627,539 | 79,348 |
| `mapReadMvSlot` | the `map`/`nulmap` slot | 462,068 | 39,941 |
| `refListSlotOfExpr` / `refListKeptSlotOfExpr` | the `reflist`/`nulreflist` slot | 205 / 160 | 145,212 / 21,029 |
| `cloArrCallRetKind` | `repSigKindOfTy(call ty)` | 3,749 | 211,941 |
| `fieldCodeCellKind` | the member's rep kind | 24 | 825 |

**Switched and deleted.** The three that agree on every call:

* `armIsNulNone` is inlined into `exprIsNulNone`'s `if` arm, reading `nodeRepIs(·, "nulnone")`.
* `callResultIsLitAtom` becomes `nodeRepIsAtom` at its one caller, `callStoreIsLitAtom`.
* `callStoreListKind` becomes the call's rep kind in `readCallStoreKind`. `callLoweredKind`, which
  only it called, goes too, and so do `fnLoweredKind` and its `flk*` memo, which only that one called.

`forInElemKind`, `scalarKindWidth`, `readListKindOf` and `readKindIsNul` move to the census's
`NOT_BLIND` and lose their probes, as round 20 found by inspection: the first reads only the
iterable's type, the other three are fixed lookups over a kind.

**`exprUnionCall`.** All 9 disagreements are where the legacy classifier says union and the call's
recorded type does not. They are in two programs:

* `recursive-fn-joins-runtime-numbers-apart.vl`: the self-call `ret(q, d, n - 1)` is recorded
  `<error>`. `checkCallOnFuncTy` (check_calls.vl) types a direct self-call as the provisional
  `inferObserved`, or `TY_ERR` when no return has been seen yet. A trial that recorded each such call
  again at `inferRetPublish` still read `<error>` in the shadow, so something writes the node again
  after the publish. The fix is not local and was reverted.
* `numeric-join-held-back-through-a-wrapper.vl`: `lit(0, z, z)` over `lit<i64, i64>` is recorded
  `i64`, while the instance joins its literal arm apart and returns the box. That call is not
  recursive. The gap is a generic call's substituted return against its instance's own join.

The missing fact is the same in both: a call's recorded result at its callee's published join.

**What stands, with the missing fact:**
* `cloRetKindOf`, `cloRetValKind`, `cloRetValSlot`: `repOfFnSlot` reads `fRetKind`, which keeps
  `i32` for closure, list and variant results (lane w168's columns).
* `calleeRetKindOfRead`, `calleeReturnsStructIdxOfRead`: a callee read's type gives no sig key in
  7,234 calls (a binding typed through a hole or an alias). The fact missing is the read's sig key.
* The slot readers (`globalReadStructIndex`, `mapReadMvSlot`, `refList*SlotOfExpr`,
  `nulVariantIdxOfExpr`): `rdSlot` is not the slot these tables are indexed by (`0/-1` and `1/-1`
  dominate). They need the rep descriptor's slot in the reader's own table.
* `cloArrCallRetKind`, `fieldCodeCellKind`, `unionIdentReadKind`: these answer for the cell or the
  element signature, not the node's narrowed type, like round 20's cell readers.
* `exprIsClosureNoLocal`: the 56 are closures held by a local, which this classifier excludes on purpose.
* Still not shadowed: the 40 other probed classifiers. Most take a binding name or a function slot,
  not a node, so their twin needs a binding's rep, not `repOfNode`.
