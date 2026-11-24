## Codegen, memory & runtime (Track B)

- **Fixed D17320** (clause 1): a `{}` completing a union arm whose omitted field is `boolean | null`, or a literal union with `null`, was invalid wasm: the field's check-minted `null` names no null of its own, so it was written as `ref.null none` into the i32 sentinel slot. The omitted field now takes its slot's own null.
