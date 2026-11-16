## Type system (Track A)

- **D16470 narrowed, D16810 closed:** `==` in a generic body over field or element reads of two records of one field set stored apart (`a.v == b.v` at `{f: i32}` and `{f: f64}`) now compares field by field at the instance instead of being refused at emit; over nullable records it no longer builds invalid wasm. A call operand (`id(a) == b`) is still refused at emit.
