## Codegen, memory & runtime (Track B)

- **IR: two `tests/cases` claim fallbacks closed.** An assignment's re-read of its `K | null` target (`return k = pick(b)`) recovered into a temp typed at the cell but held at the member's rep, which verifier rule 3 refused; the recover temp now takes the cell's nullable inner type where that inner is the read's rep. A literal-union list's `pop() ?? <member>` was refused by the verifier's scalar-element rule, though legacy's `popOrPlanOf` pops it as its i32 atom ids; the rule admits an `RAtom` element.
