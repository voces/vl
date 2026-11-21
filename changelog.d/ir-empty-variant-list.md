## Codegen, memory & runtime (Track B)

- **IR: a list literal of a non-null variant's records builds as the short list.** `const none: Tok[] = []` and `[{ a: n }, x]` at a ref-list slot whose element is a union variant were `array ref` (self-compile 9, corpus 168 alone). An empty one takes the plain slot; a non-empty one takes `arrLitVariantSlot`, one decision legacy's `emitArrRef` and the IR both read: each element an object literal built at the variant's row (`objLitAt`, legacy's `emitVariantStruct`) or a value of the variant as it stands.
