## Codegen, memory & runtime (Track B)

- **IR coverage: a `null`-typed value stored where a nullable reference is expected.** The bottom ref is already a value of any rep that lowers to `ref null $T`, so a global's initializer or a call's argument takes it with nothing written; a niche-encoded nullable (an atom's `-1`, a boolean's `2`, a box's tag) still converts (`repNullRefFits`, coordinator ruling 2026-11-22).
