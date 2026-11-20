## Codegen, memory & runtime (Track B)

- **IR coverage, list literals at their build type:** the IR now builds a list literal at the
  type legacy builds it at (`arrLitBuildTyOf`), not at the literal's own stamp. A generic
  instance's literal is therefore the instance's list, a literal whose destinations agree on
  another list is that list, and a sub-word list's elements verify as the plain i32s its backing
  truncates. That covers 395 more corpus functions and 15 more in the self-compile. No emitted
  byte moves.
