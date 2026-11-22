## Codegen, memory & runtime (Track B)

- **IR: a union box narrowed to a record arm is unboxed at a record destination (`narrowed read`).** `function pick(e: Circle | null | string): Circle | null { if e is string { return null }; return e }` delivers `e` as legacy does: the box, then its payload cast to the arm's record (`emitArmUnboxAt`, legacy's table unbox). This applies to a return, an argument and a binding. The IR's new `RArmUnbox` lowers through it. Legacy bytes are unchanged.
