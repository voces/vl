## Codegen, memory & runtime (Track B)

- **IR: a union `==` whose box is a narrowed or captured read builds in the IR**: a union local narrowed to a smaller union, a nullable union local recovered past its `null`, and a capture read are recorded as reads the lowering can write again, so the compare re-reads its box as legacy does. tests/cases `union compare box`: 10 functions → 2 (a `match` over a literal-and-type union is the main shape).
