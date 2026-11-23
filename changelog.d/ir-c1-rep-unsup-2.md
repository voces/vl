## Codegen, memory & runtime (Track B)

- **IR coverage, `rep unsup` batch 2:**
  - An empty `[]` whose element never pinned is now built as the scalar list legacy's builder writes.
  - A shared field read through a hole parameter held as a union box reads at the arms' one storage type.
  - A `let` read typed open takes its variable's rep, and `==` over an open operand follows legacy's atom compare plan.

  tests/cases `rep unsup` goes from 33 functions to 27.
