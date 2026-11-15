## Codegen, memory & runtime (Track B)

- **D4192 closed:** a null-only list literal as the `??` default of a nullable list of nullable numbers or records runs: `const xs = g() ?? [null]` at `g(): (i32 | null)[] | null` prints `xs.length` as `1`, where it was "`??` over a list whose default is a list of another storage builds no single list". The emit guard now reads the storage the checker stamped on the literal, not its own `null[]` type.
