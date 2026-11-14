# Filing the SILENT cells of four capability-matrix templates by mechanism, 2026-11-14

Lane G.

Grading D16205's neighbours left 16 SILENT cells, check-clean but invalid wasm, identical on master
and after D16205. They came from four templates. Each cell was delta-debugged to a minimal
witness, then one ingredient was removed at a time, and the families follow that ablation, not the
validator's sentence. Grading the fixes against 167 neighbouring templates found 8 more cells in 5
further templates, filed the same way. The 24 cells are the named set
`d16360-matrix-silent-cells`.

| row | cells | family | status |
| --- | --- | --- | --- |
| D16360 | 1 | first `.set`/`.push` of a one-literal value into an un-annotated container | closed |
| D16361 | 7 | written generic binding, called, in a closed-type list beside another member | open |
| D16362 | 8 | record field of a list of an integer-literal union with a member past `i32` | closed |
| D16363 | 6 | written generic binding called at two types, copied into an un-annotated holder | open |
| D16364 | 1 | function declared before a module-level `[]` that later top-level code pins | open |
| D16365 | 1 | un-annotated parameter handed `[]`, two records of an empty-list field | open |

## Change (net compiler lines +6; pin-helper delta 0)

- D16360 (`check_member_call`): every later write into a container slot is checked with
  `assignableExpr`, which records the value's delivery at the slot (`recordCtxTy`). The first
  `.set` and the first `.push` pinned the slot and recorded none, so a one-literal value was
  emitted as a string into the atom slot its set pins. Both first-pin arms now record it, as
  `m[k] = v` already did.
- D16362 (`emit_shape_intern`): `fieldCodeOfTyCovered` coded any list of an integer-literal union
  as an `i32` list. `nfcIsIntLitUnion` now asks that each member fit `i32` (`litBaseTy`), as the
  rest of the rep does, so `(9000000000 | 1)[]` is a list of union boxes in a field as outside one.

## Not fixed here

- D16361 and D16363 sit in the function-set decision for written bindings (bucket (a) of the
  clause-2 map, beside D16301's population). D16361's coerce to a closure is recorded only for a
  set delivered alone.
- D16364 is a declaration-order dependence. One spelling traps the compiler at `sameNumeric`
  reading `tyAt(-1)`.
- D16365 is the empty-list default of a record field under a hole parameter.

## Grading

`--before` master `b45a06ef`.

- 167 neighbouring templates: 0 runs→not-runs and 0 new silent. 9 cells newly run, and 7230 of
  8742 graded cells run.
- `regress.vl`: 0 runs→not-runs, 0 →silent. Against the master seed, the only difference is the
  9 named cells this PR closes.
- `check-filed-witnesses --strict`: 5023 graded, 5023 as filed.
- Two `tests/cases/literal-unions` fixtures: each fails on master and runs after.
