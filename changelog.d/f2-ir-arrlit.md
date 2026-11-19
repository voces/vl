## Codegen, memory & runtime (Track B)

- **IR coverage:** a short ref-list literal whose elements build as themselves is built by the IR, through `emitArrRef`'s shared decision and tail (`array ref` alone: 491 → 240 corpus functions).
