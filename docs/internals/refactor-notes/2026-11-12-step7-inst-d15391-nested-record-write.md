# Step 7 inst: a nested record written whole shares its binding's row, 2026-11-12

Lane w321, D15391. Take `let r = { g: { f: [id1] } }` then `r = { g: { f: [id2] } }`, with the
functions un-annotated and called at two types.

D15351 joins the list literal of a record written whole into a holder of a tagged set, but only
at depth 0 (`ftRecWriteJoins`). One record deeper the list was never joined, so the global had
no row: `ref valtype with no interned shape`. Lifting the depth limit alone gave an invalid module.
`wasm-dis` showed why. The record solve builds the written literal at the binding's widened
record (`recLitFnFieldsRestamp`), at the row `{g:{f:i32[]}}`. The `let`'s own literal stayed
at its literal row `#anon1`. These are two struct types of one shape, both holding the shared
inner row, and the type section keeps them apart.

## Changed

All in `check_fn_tag.vl`.

- `ftRecWriteJoins` joins a written record's list literal at any depth.
- `ftWrittenInitNote` records the binding's own record-literal initialiser when a store writes a
  literal the record solve widens over that binding. The tag pass then rebuilds the
  initialiser at the same widened type as the written literal.

## Rejected alternative

Stamping the initialiser at the tag pass's rep (`fnTagHeldNote`) broke `let v = {g: {f: [id1]}};
v = {g: {f: [id1]}}`. That program ran before. The written literal there needs no widening, so it
stays at its literal row while the initialiser moved to the rep's. The matrix's `local_assign`
and `struct_field_init` cells caught it as runs → SILENT. Keying the initialiser off the written
literal's widened type instead leaves every write that widens nothing unchanged.

## Measured

`scripts/capability-probes/matrix/nested-record-of-hole-fn-list-written-whole.matrix.vl`:

| | master | this branch |
| --- | --- | --- |
| runs, of 60 graded | 50 | 58 |
| un-annotated runs, of 30 | 22 | 28 |
| `runs → not-runs` | — | 0 |
| silent | 0 | 0 |

These cells moved to runs: `write_whole`, `write_whole_twice`, `write_whole_in_function` and
`write_whole_two_elements` (un-annotated); `write_three_deep` and `write_whole_with_sibling`
(both faces). The remaining two are `return_annotated` and `argument` (un-annotated),
monomorphize refusals of the plain value.

## Proof

SWEEP
