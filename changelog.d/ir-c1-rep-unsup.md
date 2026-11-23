## Codegen, memory & runtime (Track B)

- **IR coverage, `rep unsup` batch 1:** three cases whose own type has no rep are now built.
  - A read of a hole-typed parameter takes the rep its frame holds it at (legacy's declared kind).
  - An arithmetic operator takes legacy's operator width.
  - A direct call takes its callee's result rep, including a call the checker recorded at `<error>` (D17073).

  tests/cases `rep unsup` blockers go from 45 functions to 33.
