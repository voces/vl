## Codegen, memory & runtime (Track B)

- **D17065 closed:** a union compared with a `string | null` or `K | null` operand, over a union with no `null` arm, now runs instead of building invalid wasm, and a `boolean | null` field or call compared with a union answers correctly; a 96-program grid goes from 56 run to 92. The 4 left (a `K | null` call operand) are a named emit reject, D17066.
