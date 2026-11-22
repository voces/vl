## Codegen, memory & runtime (Track B)

- **IR coverage: a union-box list bound at another union's list.** Every union row is one wasm list over one box heap, and legacy's plain `let` writes no convert, so the IR retags the list as it stands (`boxListRetag`). This covers the distilled corpus's `declaration coercion` d741/d853 family, 14 → 0 cells: 13 named and 1 tests/cases.
