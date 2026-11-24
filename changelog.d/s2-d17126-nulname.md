## Codegen, memory & runtime (Track B)

- **D17126 closed:** a name, field or element read narrowed to `null`, compared with `==`/`!=` to a nullable of another type (`i32 | null`, `string | null`, `boolean | null`, `f64 | null`, a wide union, a record, a list), is now that operand's null test. Before, it was a constant `false`, an invalid module, or an emit reject.
