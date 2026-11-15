## Codegen, memory & runtime (Track B)

- **AE-004 design filed:** an `F32x4` in a record field has only the boxed `F32x4 | null` spelling, which allocates twice per write at -O3 (D16480); a record literal holding a vector is refused before it widens (D16481). `docs/internals/ae-004-vector-field-design.md` proposes a `v128` struct field.
