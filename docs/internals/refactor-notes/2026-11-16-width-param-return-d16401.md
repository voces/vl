# A declared return of a rewritten record parameter is the instance's record (D16401), 2026-11-16

Lane WIDTH. This is the last refused position of the L3 parameter face.

## What changed

The width rewrite (D3992, `wsApplyPending` in `check_width.vl`) makes a declared record parameter
generic at a row slot. It now also respells the declared return at that slot when every `return`
in the body, outside nested functions, returns the parameter itself (`wsRetOnlyParam`). The rename
is the parameter's own (`wsTsRename`), so `R | null` and `R[]` follow too. Undoing the rewrite
restores the return (`wsOrigRet`). A body that returns anything else, a fresh literal for
example, keeps the declared return, so `function mkP(p: P): P { return { name: p.name } }` still
runs at its declared type.

## Measurements

| instrument | before (master fixpoint) | after |
| --- | --- | --- |
| `record-param-width-{before,between,inline}` (with #8509's templates) | 29 of 30 graded, `returned` refused | 30 of 30 |
| `record-param-width-after`, `-is-nullable`, `existing-record-into-narrow-record` | unchanged | unchanged, 0 runs → not-runs |
| `record-nested-width-existing.matrix.vl`, new `param_returned` | refused in both faces | 76 of 76 graded, 10 owed |
