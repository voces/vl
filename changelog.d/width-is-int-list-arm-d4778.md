## Codegen, memory & runtime (Track B)

- **D4778, D16884:** `x is K[]…[]` over a box union whose list arm is `i32[]…[]`, `K` a set of `i32`
  literals, tests the arm's tag and then every leaf: one layer was a loud emit reject (D4778) and a
  nested arm was silently false (D16884, clause 1).
