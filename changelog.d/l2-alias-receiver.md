## Type system (Track A)

- **D2520 (local half), D3818, D16807 closed: a member call through a local that only ever holds a
  parameter is dispatched per instance** (`refactor-notes/2026-11-16-l2-alias-receiver.md`). A
  `const`, an unwritten `let` or a chain of them reads as the parameter, so a built-in, an
  overloaded candidate or a map value is picked at each instance. D16877 filed for the closure half.
