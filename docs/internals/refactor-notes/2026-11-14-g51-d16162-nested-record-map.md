# D16162: a stored record's field holding a record literal is pinned as a stored record, 2026-11-14

Lane G.

`m["k"] = { r: { f: inc0 } }` with `inc0` un-annotated and uncalled. `monoPinStoredRecords` pins a
map's open record value field by field. A function field goes through `monoStoredSlotFnTy`, which
instances each stored function at the slot's pin or the uncalled default. A field holding a
record took the D9183 arm instead. That arm records the elaboration's slot fact on the literal but
instances nothing. `inc0` stayed a generic value, and the value floor refused it.

## Change (`emit_mono`, `monoPinStoredRecords`)

- When every stored value holds a record literal at an open record field, that field is pinned by
  `monoPinStoredRecords` itself, at the field's path, over those literals. It recurses to any
  depth, and its function fields take `monoStoredSlotFnTy`'s instance.
- The arm comes before the D9183 slot-fact arm, which still answers a field holding a binding.
- No new top-level function: the pin-helper budget stays at 908.

## Grading

Fixpoint seeds on both sides, `--before` master `293074ba`.

- The witness prints `true`. The row's list spelling, `m["k"] = [{ r: { f: inc0 } }]`, prints
  `true`.
- New `map-value-nested-record-of-hole-fn-uncalled.matrix.vl`: `map_value` (un-annotated),
  `map_index_read`, `map_list_value`, `map_three_deep`, `map_two_fns`, `map_sibling_fn` and
  `map_has` (both faces, but `map_value` un-annotated only) moved from the generic-value refusal to
  RUNS. That is 60 of 64, with 0 runs→not-runs and 0 silent.
- The four that do not run are two rows filed here. `map_in_record_field` (D16201) now reaches the
  refusal its one-level spelling already gives on master (`map values must be i32 / boolean`).
  `bound_into_map` (D16202) is unchanged.
- 0 runs→not-runs and 0 new silent on `record-field-map-of-fn-records`,
  `hole-fn-map-in-record-field`, `map-value-adopted-recursive-record`,
  `record-literal-widened-map-store`, `fn-value-generic-in-map-of-records-open`,
  `map-set-hole-param-open-record`, `anon-nested-record-map-field-param`,
  `fn-value-generic-map-stored-field-read-handed` and its open face, `hole-fn-record-list-element`,
  `list-of-bound-lists-of-hole-fn-records`, `fn-value-two-generics-in-map-of-records-open` and
  `pinned-map-of-hole-fn-one-signature` (its SILENT cell is D16124, as on master).
