## Codegen, memory & runtime (Track B)

- **IR coverage: a module global of the `null` type.** Its initializer is written as legacy's `emitNulNoneBoxPayload` writes it: a call's own value, or the expression run for its effect and then the bottom null. `start: global initializer nulnone`; a value `if` stays a named miss. No legacy bytes moved.
- **Filed D17124** (clause 1, on master too): a `null`-unit binding read as an `if` arm that joins into an annotated `T | null` binding is invalid wasm.
