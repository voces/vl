## Codegen, memory & runtime (Track B)

- **IR coverage, arms that never return:** a value `if` arm whose value is a call that never
  returns, and a tail arm whose last statement follows an exit, build through the IR as legacy
  writes them. No emitted byte moves.
