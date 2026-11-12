# Step 7 inst: a list of bound lists of hole-function records gets its row, 2026-11-12

Lane w321, D15358, D15356 and D15159. They are three of the containers-of-un-annotated-function rows that
refuse with `ref valtype with no interned shape`.

Take `const inner = [{ f: id1 }]` then `const xs = [inner]`, with `id1` un-annotated and called
at two types. `inner` is stored at a row the intern pass minted from its literal (`#anon0`). That
row's element type is `{f: (_) => _}`, which still holds the hole. `xs`'s element type,
`{f: (_) => _}[]`, keys no row: `rlRowOfTyMinted` refuses a type with a hole, and D15350's deep
held-rep stamp is taken only when every inner element is a list literal. So the global cell had
no slot and `emitGlobalSection` refused.

## Ablation

All cells are in the un-annotated face, on master `426f9f27`.

| witness | outcome |
| --- | --- |
| `[[{f: id1}]]`, read at two types | runs (D15350's deep stamp) |
| the same, one call type | runs |
| `const inner = [{f: id1}]; const xs = [inner]` (D15358) | `ref valtype with no interned shape` |
| `[[{f: id1, n: 3}]]`, `f(xs[0][0].n)` (D15356) | `ref valtype with no interned shape` |
| `xs.push([{f: id1}])` onto `[[{f: id1}]]` (D15357) | `ref valtype with no interned shape` |
| `{g: {f: [id1]}}`, written (D15391); the `if`-joined record, D15390 | `ref valtype with no interned shape`, through the record's own field row |
| lists of maps of hole functions (D15394, D15395) | `ref valtype with no interned shape`, through the map value row |

The message is shared, but there are three families: the list of lists, the record field row and
the map value row. This change fixes the first.

## Changed

- `arrLitRowSlotIn` (`emit_classify.vl`) falls back to `arrLitRowOfInnerRows` when its type keys
  no row. That covers a list literal whose element type still holds a hole, carries no checker
  stamp, and whose every element is a list of records stored at one row (`refListSlotOfExpr`).
  The literal is built at the list of that row, found by name, else minted.
- Inner rows are limited to records. A list of functions may be a tagged set's ids, an `i32`
  list no row holds. An earlier cut without that limit built D14782's `[[inc, dbl]]` at a
  closure row and emitted an invalid module (`expected i32, found (ref $0)`). The sweep caught
  it as a new compiler trap, and D14782 is back to its filed refusal.
- `rlListOfRowMint` (`emit_state.vl`) is a hook beside `rlRowMint`, open only while collect has
  the mints on. Collect's `rlListOfRowMinted` interns the row under the inner row's spelling
  plus `[]`, at `mkArrayTy` of the inner row's element type, so its kind is the ref list.

## Measured

`scripts/capability-probes/matrix/list-of-bound-lists-of-hole-fn-records.matrix.vl`:

| | master | this branch |
| --- | --- | --- |
| runs, of 56 graded | 29 | 43 |
| un-annotated runs, of 28 | 3 | 17 |
| `runs → not-runs` | — | 0 |
| silent | 0 | 0 |

These cells moved to runs: `binding`, `global_init`, `closure_capture`, every `block_*` and
`fn_body*`, `same_binding_twice`, `literal_lead` and `local_scope`. The un-annotated reds that
remain are as follows.

- `array_element`, `global_assign`, `read_through_index` and `for_over_outer` hit D15338's
  generic value floor, which D15357 now meets too.
- `local_assign` gets `called at two signatures`.
- `return_inferred` and `struct_field_init` are the record-field family.
- `argument` is a monomorphize argument type.
- `map_*` is the map value family.

`struct_field_*` in the annotated face is a check refusal of the template's spelling: the
prelude's `inner` keeps its hole.

## Witnesses moved

- D15159 runs. It was D15158's position witness and the control of
  `tests/vl_capability_matrix_test.ts`'s emit-reason guard. Both now use D15391's written record,
  which still refuses with the same text from `emitGlobalSection`.
- D15357 now meets D15338's generic value floor. Its row is re-graded, still open.
- D15338's title said "check-clean invalid wasm"; its status line was already a loud emit reject.

## Proof

SWEEP
