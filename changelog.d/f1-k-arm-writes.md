## Type system (Track A)

- **D17002 closed:** inside `is K[]` over a numeric list arm stored apart from `K[]`, a write through the index stores a `K` converted to the arm's element, and a `for` binds each element as a `K`. This holds at `u8[]`, `i64[]` and `f64[]` arms, in a function and at module scope.
