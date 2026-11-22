## Codegen, memory & runtime (Track B)

- **IR coverage: a map global read at its binding's storage type in a function that does not write it.** Legacy stores a map cell at that type's shape (`letCellSlot`), so the read takes the cell as it is (distilled corpus `global read coercion` 15 → 3).
