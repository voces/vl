## Codegen, memory & runtime (Track B)

- **IR coverage, union joins decided by a literal `true` and arms that are themselves an `if`:** the rewrite's `if true { … }` value form is decided as legacy decides it, its else arm written dead, and an arm whose value is another `if` joins into the same union box.
