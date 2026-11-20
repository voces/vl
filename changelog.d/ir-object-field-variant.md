## Codegen, memory & runtime (Track B)

- **IR coverage, an object literal's variant field arms:** a variant row's field at the box,
  `f64`, `i64` or `f32` arm is delivered at its slot's rep through the shared box and widening
  plans, as the struct arms are. 376 more corpus functions are built by the IR. No emitted byte
  moves.
