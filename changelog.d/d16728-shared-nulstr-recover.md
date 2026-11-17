## Codegen, memory & runtime (Track B)

- **D16728 closed:** a `string | null` field shared by a record union's arms, read off the un-narrowed union after a null test of the read, is delivered non-null into a string slot (`print`, a `string` binding, `+`, a return, an early-return guard, a three-arm union, a union with `null`). On master each built invalid wasm.
