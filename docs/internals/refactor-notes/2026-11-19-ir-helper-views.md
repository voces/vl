# Runtime helpers through the IR, step 4: the list view helpers (2026-11-19)

Family G of §10.1(b) (`ir-design-2026-11.md`): the scalar list views (`__sv_mk_p__`,
`__sv_sync_d__`, `__sv_get_d__`, `__sv_len_d__`) and the record list views (`__rv_sync__`,
`__rv_get__`, `__rv_len__`) are built as IR and lower to the bytes their hand-written writers
emitted. The writers and their sub-writers (`svGuardedIdx`, `svRefTest`, `rvSrcElem`,
`rvBoxElem`, `rvUnreachableBody`) are deleted.

## Shape
- One view model serves both kinds: a `ViewList` (wrapper, backing, and the box struct for a
  record list) and its `ViewRow`s (view type, source list, and the element's convert or box tag).
  `irViewSyncFnCode`, `irViewGetFnCode` and `irViewLenFnCode` each build both kinds. They differ
  only in how a source element becomes a view element (`sourceElem`).
- Three raw ops: `ref.test`, `select`, and `push`.
- A helper's valued `if` may now yield a raw reference: `fbIfRefNul`'s block type, as the record
  box of a nullable row needs.
- **`push`** writes a variable or immediate where it is defined, below whatever the body computes
  next. The nullable record row's store is `array.set backing i <valued if>`, and the IR places a
  valued `if` at its statement position, so the store's two leading operands are pushed first. The
  lowering keeps pushes off the pending order and checks that the next effect consumes every
  outstanding push as its leading operands, in push order; a push left unconsumed is a miss.
- The record element's heap type is not tracked: it is a raw rep at heap -1 (any) between its
  `array.get` and its box or null test.

## Measured
- Against the F seed (hand-written views): the self-compile is identical; every `tests/cases`
  program not `@error` plus every capability probe: identical 7511, fail under both 68, differ 0.
  The scalar and record view cases (`readonly-*-view-*`, nullable-record sources included) build
  identically.
- Lines, compiler only: +406 / −429. A first cut with separate scalar and record builders was
  +53. Folding them into one view model is what made it negative.
