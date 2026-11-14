## Type system (Track A)

- **D15978, D16044, D16045 closed:** a `flat` record's `u8`/`i8`/`u16`/`i16` field has storage semantics. A computed value keeps its low bits at the field's width, a read widens back to `i32` (signed for `i8`/`i16`), and a literal outside the field's own range is refused. Sub-word fields are packed WasmGC struct fields; `i8`, `u16` and `i16` are storage types like `u8`.
