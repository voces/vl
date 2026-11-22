## Codegen, memory & runtime (Track B)

- **IR coverage: `o.v ?? d` over a global receiver.** A `??` over a value-union record field whose receiver is a global, or a global's field, re-reads the receiver in the present arm as it was first read (`irHoistRecv`), where legacy's `emitCoalesceUnionField` re-emits it.
