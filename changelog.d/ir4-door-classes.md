## Codegen, memory & runtime (Track B)

- **IR coverage at the list-literal door:** a list literal holding a value `if` now lowers through
  the door. So does a list literal in a start body or function that has a proven string
  accumulator, since the fragment now checks that the accumulator rows belong to its own body
  rather than refusing whenever any row exists. No emitted byte moves.
