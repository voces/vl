## Type system (Track A)

- **D16361, D16332 and D16363 closed:** a written generic `let` called directly holds its set's
  id; listed beside another function at a closed type it is that member's closure there, and
  handed to a generic in such a list it stays a closure. A copy of a binding called at two types,
  written into an un-annotated binding or map, stores the id rather than one instance's closure.
  `fn-value-generic-list-literal-arg-at-i32.matrix.vl` runs all 46 graded cells.
