## Codegen, memory & runtime (Track B)

- **IR coverage: a function-valued field called off a receiver that is not a plain record.** `fieldCallRefPlainHead` no longer asks for a struct receiver, since legacy's `emitCallCore` sends any closure-typed callee to `emitCallRef` whatever `o` is; the callee's field read is the IR's own. In tests/cases' 13 `method f` programs, functions matched rise 230 → 243 and `method f` falls 21 → 5. Legacy's bytes don't change.
