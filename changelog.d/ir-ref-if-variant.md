## Codegen, memory & runtime (Track B)

- **IR: a value `if` joined at a variant row, and a reference join's bare `null` arm, build**: `ifRefExpr` takes the variant kind, and a `null` arm is `RJoinNull`, the join's typed `ref.null` at the kind and row the builder takes from `ifRefJoinOf`. Self-compile: `ref if arm null` 4 → 0 and `expression if ref variant` 5 → 0, +5 claimed functions, and 3 moved to `box ladder` (IR-N2). Byte-identical.
