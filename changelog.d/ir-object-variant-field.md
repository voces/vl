## Codegen, memory & runtime (Track B)

- **IR coverage:** a binding of a record literal stored at a union arm's row (`const cc = { r: null }` for `Circle = { r: i32 | null }`) is held at that row, as legacy holds it, so its boxed or widened field and its return are built by the IR.
