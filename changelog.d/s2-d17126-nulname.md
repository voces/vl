## Codegen, memory & runtime (Track B)

- **D17126 closed:** a name, field or element read narrowed to `null`, compared with `==`/`!=` to a nullable of another type (`i32 | null`, `string | null`, `boolean | null`, `f64 | null`, a wide union, a record, a list), is now that operand's null test. Before, it was a constant `false`, an invalid module, or an emit reject.
- **D17113 closed:** a narrowed map value of an un-annotated record compared with `==` to a declared record whose nullable field it holds as `null` (`{ f: null, g: 7 }` against `J = { f: i32 | null, g: i32 }`) now runs; before, it was an emit reject (a clause-2 refusal) or invalid wasm.
