## Codegen, memory & runtime (Track B)

- **IR coverage: a literal-union list boxed under its arm's tag.** `show(ks)` with `ks: K[]` passed where `i32[] | K[]` (or `K[] | W`, `f64 | K[]`) is expected missed at `box ladder`. Legacy writes the atom-list arm's tag where the program boxes one, else the list kind's, then the list and the box. The box plan names that tag (`atomList`, or `atom` at kind 7) under the same condition legacy's `emitUnionCoerceAtomBox` reads.
