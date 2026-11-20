## Codegen, memory & runtime (Track B)

- **IR: an element store into a byte list:** `bs[i] = v` over a `u8[]` builds in the IR, the value as a plain i32 the packed backing truncates, as a push onto a byte list takes it. Byte-identical; the 337 distilled functions that filled a byte buffer for `__str_from_bytes__` now wait on that intrinsic alone.
