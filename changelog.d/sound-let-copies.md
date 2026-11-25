## Codegen, memory & runtime (Track B)

- **Fixed D17362** (clause 1, check-clean invalid wasm): a record of un-annotated functions re-pointed through more than 16 `let` copies of its binding built an invalid module, since the copy walks stopped at a fixed depth. Each now ends by its visited set, so any depth builds as one copy does.
