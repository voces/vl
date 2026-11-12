## Codegen, memory & runtime (Track B)

- **D12452 closed:** a generic-alias application now interns at its checked instance type, so `Bx<GB<i32>>` with a `(V | null)[]` field builds, reads, pushes and iterates its nullable elements. The spelling mint (`gaeApplyFieldTy`, `monoSubstAnn`) is deleted.
