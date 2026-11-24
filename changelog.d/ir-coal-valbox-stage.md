## Codegen, memory & runtime (Track B)

- **IR coverage: a `??` over a boxed binding, passed after another argument** (`filled(2, q ?? b)`, `f(two(), q ?? d)`). The IR now writes the earlier argument first, then the `??`'s tag test, with the default in its null arm only, as legacy writes it. `short-circuit argument after another` goes from 7 functions to 0 (1 in tests/cases, 6 corpus cells). Legacy's bytes don't change.
