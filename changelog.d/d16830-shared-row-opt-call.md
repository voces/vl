## Type system (Track A)

- **D16830 closed:** a `?.` call through a record nested in a map's entry, holding un-annotated functions, beside a declared record of the field's name (`type G = { f0: (a: i32) => i32 }`, `m.get("b")?.r.f0(3) ?? 0`), runs. Emit used to refuse it with "union if-expression arm ends in a void call".
