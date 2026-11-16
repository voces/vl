## Type system (Track A)

- **D16700 closed**: a nested list of un-annotated functions delivered to a closed function type bound only the first member's holes, so `[[inc], [dbl]]` returned at `((a: i32) => i32)[][]` beside an `f64` read built invalid wasm inside `dbl`. Every un-annotated member of the set now binds at the destination's parameters: the witness prints `6` and `2.5`, 12 silent and 15 loud cells of the nested-list matrix run, and a member whose body cannot hold at the destination is a check reject instead of invalid wasm.
