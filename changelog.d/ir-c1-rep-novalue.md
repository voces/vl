## Codegen, memory & runtime (Track B)

- **IR coverage: a reference join's arm that never returns.** `const v = if c { s } else { fail("x") }` over a string or list, and the narrowed `is` chains the checker closes with `__trap__()`, now build: the never arm is that call's statement, as legacy writes it, and nothing is stored into the join. tests/cases `rep novalue` falls on those arms, and 22 more functions are claimed.
