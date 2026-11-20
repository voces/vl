## Codegen, memory & runtime (Track B)

- **IR coverage:** `o.v ?? d` over a value-union record field is built by the IR through legacy's shared box read and null test, its default only on the null path and the box kept or its atom unboxed (a capability; no self-compile or corpus function reaches it today).
