# A callback over a field read of a built list takes the list's build (D16210), 2026-11-16

Lane WIDTH, bucket (b) of the clause-2 map.

## What changed

`elabListElemBuild` (`emit_elab.vl`) gives the record a list callback's receiver elements are
stored at. It already answered a binding, a list built at a wider record, and a stamped `filter` or
`slice`. It now also answers a field read `r.f` where `r` is an un-annotated binding of a record
literal and its initializer is the only value ever stored at that field (`cwSlotWrittenValues`): it holds what its
initializer holds, so the answer is the initializer's (`elabHeldFieldInit`). A field that is
written, or a deeper path (`r.a.f`), keeps the old answer.

## Measurements

| instrument | before (master fixpoint) | after |
| --- | --- | --- |
| `callback-over-built-list.matrix.vl` (#8509's copy) | 44 of 50 graded, `field_map` an emit reject in the un-annotated face | 45 of 50; `field_map` runs; the rest are D16211's refusals and a lambda-body tail expression |
