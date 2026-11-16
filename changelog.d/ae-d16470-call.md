## Type system (Track A)

- **D16470 closed:** `==` in a generic body over a call operand of two records of one field set stored apart (`id(a) == b` at `{f: i32}` and `{f: f64}`) now runs the call once into a fresh binding and compares field by field at the instance, instead of being refused at emit.
