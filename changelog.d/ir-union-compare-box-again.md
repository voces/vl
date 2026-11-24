## Codegen, memory & runtime (Track B)

- **IR: a union `==` whose box is a narrowed or captured read builds in the IR**: a union local narrowed to a smaller union and a closure's capture read are recorded as reads the lowering writes again, so the compare reads its box twice as legacy does. tests/cases `union compare box`: 7 functions → 1, and `coalesce box place` 2 → 0.
