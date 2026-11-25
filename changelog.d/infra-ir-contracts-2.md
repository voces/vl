## Codegen, memory & runtime (Track B)

- **Two more contracts survive the IR's claim:** taking a generic function as a value ("annotate the parameter, or call it directly by name") and a literal-union `as` that propagates its miss from a function that cannot return it ("write `as!` or `as?`") are raised inside the claim, so once the legacy emitter is gone they stay the first error instead of `cannot yet lower`.
