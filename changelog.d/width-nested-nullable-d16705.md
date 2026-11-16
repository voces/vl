## Type system (Track A)

- **D16705 closed:** nested width subtyping reaches a nested record behind `| null` on both sides (`{ pet: { legs, purr } | null }` taken where `{ pet: { legs } | null }` is declared, at its own type, no copy), and the slot face follows a `?.` read and a `!= null` test of the slot's value. Matrix `record-nested-width-nullable.matrix.vl`: 21 of 58 → 56 of 56 graded cells run, 4 owed.
