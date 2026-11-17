## Type system (Track A)

- **D16948 filed and closed (clause 1):** a list literal whose elements differ in a nested record field (`[{ z: { f: 5 } }, { z: { f: { a: true } } }]`) runs; it built invalid wasm, or a module that did not parse, at every position.
- **D16911 closed:** the annotated spelling of that literal two records deep runs, where it was refused at emit.
- **D16949 filed:** a field read across record arms whose shared field is a record in one arm is refused at emit.
