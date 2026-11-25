## Codegen, memory & runtime (Track B)

- **IR claims an operator whose left operand never returns beside a wider operand** (`fail() * x` with `x: f64`), computed at that operand's width: the call runs and diverges, nothing reads its place.
