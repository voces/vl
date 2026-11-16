## Codegen, memory & runtime (Track B)

- **IR cutover C2h, string operators, char literals and the string list read:** string `==`/`!=`,
  ordering and `+` chains, char literals and a `string[]` read now go through legacy's own arms in
  the IR. The IR covers 392 more corpus functions and 1,487 more self-compile functions, every one
  it lowers matched. The blocker census no longer reports `valued tail if`, which was its own
  artifact. No emitted byte moves.
