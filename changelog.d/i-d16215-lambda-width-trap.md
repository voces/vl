## Type system (Track A)

- **D16215 closed:** a wider record handed to a lambda whose parameter is a declared record type, the lambda bound before the record, runs: `const show = (p: P) => print(p.name); const v = { age: 3, name: "a" }; show(v)` prints `a`, where `vl check` trapped the compiler. A check restart now clears the slot call and annotation types the previous pass noted.
