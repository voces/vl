## Codegen, memory & runtime (Track B)

- **IR: a local read the checker narrowed to `null` is delivered as legacy's `nullread` arm writes it (`narrowed read`).** A `let x = null` read before the write that fills it is the destination's own null when the destination's rep kind is not the storage's (`const y: string | null = x` over an `i32 | null` cell), and is otherwise the storage local as it stands (`link2(xs, x)` into a `string | null`). Legacy's decision moved into the shared `nullReadDstOwnOf`, which `emitNullReadAtDst` and the IR's delivery both ask. Legacy bytes are unchanged.
