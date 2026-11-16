## Codegen, memory & runtime (Track B)

- **IR cutover C2g, string literals, length and reads:** a string literal, a string's `.length` and
  a raw string read `s[i]` now go through legacy's own arms in the IR (`emitStr`, `arrLenTail`,
  `rawStrHoistOf`/`rawStrGetTail`). The IR covers 2,034 more corpus functions and 93 more
  self-compile functions, every one matched. No emitted byte moves.
