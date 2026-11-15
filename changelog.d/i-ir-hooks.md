## Codegen, memory & runtime (Track B)

- **IR: hooks for the list slice:** the IR builder, lowering and verifier take their list reads,
  bounds checks and reference variables from installable hooks, so a second lane builds them in
  its own files. The defaults change nothing.
