# A same-elements result of a built list is judged as its receiver is (D16763), 2026-11-16

Lane WIDTH, a clause-1 close found grading D16211's `map` template.

## What changed

- `recBuiltElemIn` (`check_fit_rules.vl`) answers a call of `filter`, `slice` or `values` with its
  receiver's element build (`recSameElemsRecv`). The emitter already stamps such a call at that
  build, so `recBuiltReadRefuse` now judges the call's delivery the way it judges the receiver's:
  an annotated argument takes the build where it can, and a narrower declared element type is
  refused with the existing built-container sentence.
- An assignment into an un-annotated binding whose initialiser holds the same element build
  converts nothing and is accepted. That makes `let v = src; v = src` run; it was refused on
  master.
- `recBuiltRetListsRefuse` judges each list an un-annotated function returns. On master
  `function d() { return src }` built invalid wasm. It is now refused; the list twin of
  `storeRetsResolve`'s record stamp is the route to running it.

## Measurements

| instrument | before (master fixpoint) | after |
| --- | --- | --- |
| `same-elems-result-of-built-list.matrix.vl` (new) | 18 of 58 graded run, **35 SILENT** | 22 of 58 run, 0 SILENT, 0 runs → not-runs; the rest are the built-container refusal |
| `callback-over-built-list`, `kept-maker-delivery*` (11 templates) | unchanged | 0 runs → not-runs, 0 SILENT |
