## Type system (Track A)

- **D16765 closed:** a `filter`, `slice` or identity `map` result of a list a kept maker's build stores at a wider record, held in a record or list literal, is laid out where its elements are, as the list itself would be, instead of failing at emit (`same-elems-result-in-literal.matrix.vl` 4 → 29 of 62 graded). Filed D16766 (the clause-2 refusal of such a result at an annotated slot where the receiver adopts) and D16767 (a returned record holding one, bound at an annotated record, builds invalid wasm, as on master).
