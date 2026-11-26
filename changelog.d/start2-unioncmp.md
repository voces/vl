## Codegen, memory & runtime (Track B)

- **IR claims a union `==` whose operand is a `let` its initializer narrowed:** the operand is read at the union box it is stored as, as legacy's `unionEqOperandTy` reads it. `union compare operand rep` falls 2 → 0: `operators/union-eq-narrowed-let-operand.vl` (`@start`) and D16034's witness are fully claimed. Claimed and claims-off builds are byte-identical.
