## Codegen, memory & runtime (Track B)

- **IR coverage, an object literal's struct field arms:** a field at the `union`, `f64`, `i64` or
  `f32` arm is delivered at its slot's rep through the shared widening and box plans, and a
  literal legacy builds at its destination's row is built there. 126 more corpus functions are
  built by the IR. No emitted byte moves.
