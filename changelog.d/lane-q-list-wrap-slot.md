## Codegen, memory & runtime (Track B)

- **IR shadow:** a compile no longer reads the list-read notes of the program compiled before it
  on the same instance. In `vl check --codegen` over several files, a second `take` at the same
  node read the first's element kind and showed a false `list read wrapper slot` mismatch.
  `ir-shadow-baseline.txt` drops that class.
