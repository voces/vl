## Type system (Track A)

- **D16774, D16775, D16776, D16777 closed**: a maker's hole lambda stored where a function type returning `f64` holds it kept its `i32` result, and the call through the holder trapped (`indirect call type mismatch`), when the holder was a record field's list or map, a list or map handed in as a parameter, or when it was read back through a generic function or `.values()`. The call search that decides such a lambda's result now follows each of those to the calls; every witness prints `0.5`.
