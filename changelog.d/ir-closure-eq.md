## Codegen, memory & runtime (Track B)

- **IR coverage, function-value `==`/`!=` and `===`:** a compare legacy writes on its `closure`
  route builds through the IR, by the identity tail legacy also writes. No emitted byte moves.
