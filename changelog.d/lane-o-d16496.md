## Type system (Track A)

- **D16496 closed:** a join whose constant arm does not fit `i32` (or is a float), beside a
  nested join of a typed `i32` arm and a literal arm, no longer builds invalid wasm. Such a
  nested join keeps its own type for its literal tails and is converted whole.
  `if c { 3000000000 } else { if c { v1 } else { 1 } }` runs and prints `3000000000`.
