## Type system (Track A)

- **`===` / `!==` run as reference identity (D15975, step 2 of 3):** records, lists and maps compare by `ref.eq`, a union of records by the record its box holds, two functions as `==` compares them, and `x === null` is the null test `x == null` is (with an `identity-null-test` hint naming `==`).
