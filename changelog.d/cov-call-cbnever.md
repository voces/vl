## Codegen, memory & runtime (Track B)

- **A named `never` function passed as a callback no longer builds invalid wasm at a value position (D17661):** the callee's specialization re-mints the call through the callback, and the copy now keeps the template's never mark. As a result, a return, an operand or a union `const` below the call gets its `unreachable`.
