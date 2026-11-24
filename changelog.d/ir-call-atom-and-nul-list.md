## Codegen, memory & runtime (Track B)

- **IR coverage: a function value called with a literal-union atom at a string parameter, or a scalar list (`f64[]`, `u8[]`) at a nullable list parameter.** The atom is decoded as legacy's `atomToStr` arm decodes it. The list is passed as it stands, null included, as legacy's `scalarList` arm passes it. `call of a non-declaration`, batch 2. No legacy bytes moved.
