## Codegen, memory & runtime (Track B)

- **IR coverage: a walk over a `(boolean | null)[]` or an `f32[]`.** Legacy's plain walk reads
  either element whole at its own rep, so the IR takes it as it takes the other plain kinds. No
  legacy bytes moved.
