## Codegen, memory & runtime (Track B)

- **IR claims an operator whose left operand never returns beside a wider operand** (`fail() * x` with `x: f64`), computed at that operand's width: the call is read at `i32` and widened, as legacy writes it.
