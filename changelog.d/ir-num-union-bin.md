## Codegen, memory & runtime (Track B)

- **IR coverage, operators over a numeric union:** an arithmetic, comparison or `==`/`!=` operator
  with an `i32 | f64`-style union operand builds through the IR. It writes legacy's stash and
  member dispatch, by the tails legacy also writes. No emitted byte moves.
