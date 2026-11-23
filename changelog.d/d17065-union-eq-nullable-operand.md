## Codegen, memory & runtime (Track B)

- **D17065 closed:** a union compared with a `string | null` or `K | null` operand, over a union with no `null` arm, now runs instead of building invalid wasm, and a `boolean | null` field or call compared with a union answers correctly; a `boolean | null` operand that is a call is read once, so its null leg runs and the call is no longer skipped; two grids of 144 programs go from 80 run to 134. The 10 left (a `K | null` call operand) are a named emit reject, D17066.
