## Codegen, memory & runtime (Track B)

- **IR builder:** an operand that must be read before a later statement and cannot be staged on the stack is spilled to a local, so a `null` test against a right side with effects (`w == (w = null)`, `g() == mk().tags`) builds on the IR.
