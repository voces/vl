## Codegen, memory & runtime (Track B)

- **IR coverage, v128 list literals:** a list literal of vectors (`[a, b]` at `v128[]`, `F32x4[]`)
  builds through the IR along legacy's short list arm, in a function body, at the start and in a
  constant cell's initializer. Legacy's v128 arm writes the same short tail (`arrLitShortTail`).
  No emitted byte moves.
