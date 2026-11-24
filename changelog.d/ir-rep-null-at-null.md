## Codegen, memory & runtime (Track B)

- **IR: an untyped minted `null`** (`rep ?` @null): a check-minted `null` with no type of its own is the bottom ref, at the `null` unit or into a `string | null`, as legacy's `emitNullAt` writes it. This covers `{}`'s omitted reference fields of a union arm, and a `?.` guard's null at a null-only instance. The verifier now refuses the bottom ref at a sentinel or box niche.
