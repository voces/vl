## Codegen, memory & runtime (Track B)

- **IR claims a call that never returns delivered into a union** (`takeU(bail("x"))` with `bail: (s: string) => never`): the call stands in for the value with no box, as legacy writes it.
