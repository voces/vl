## Codegen, memory & runtime (Track B)

- **IR coverage, `arm site operand` (the narrowed receiver):** an arm-site read, such as an element, `.length`, `.has` or `.get` through a union of lists or maps, whose receiver is a name an `is` guard narrows to a narrower union is now built by the IR. The narrowed read is the same box (`RStage`), so the chain re-reads the name's own local in each arm, as legacy re-reads the name.

  tests/cases `arm site operand` goes from 2 functions to 1. The one left, `last` (a non-atom index), follows as a Q57 PR.
