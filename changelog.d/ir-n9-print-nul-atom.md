## Codegen, memory & runtime (Track B)

- **IR coverage: `print` of a `K | null` whose operand is already a plain atom.** A narrowed or coalesced read reaches the `nulAtom` arm's tail as the i32 id it is, so the IR builds it (distilled corpus `print operand rep` 27 → 10).
