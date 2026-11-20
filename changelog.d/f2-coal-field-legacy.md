## Codegen, memory & runtime (Track B)

- **Cleanup:** a retag call in legacy's `o.v ?? d` over a value-union record field compared a type with itself and so never ran; it is deleted with its now-unused helper. Emitted bytes are unchanged.
