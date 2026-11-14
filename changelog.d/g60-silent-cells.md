## Codegen, memory & runtime (Track B)

- **D16360 closed:** the first `.set` or `.push` of a one-literal value (`const a: "a"`) into an
  un-annotated `Map()` or `[]` stores the atom its slot holds, instead of building an invalid module.
- **D16362 closed:** a record field of a list of integer literals with a member past `i32`
  (`(9000000000 | 1)[]`) is a list of union boxes, instead of an `i32` list that failed to load.
- Filed D16361, D16363, D16364 and D16365, four open clause-1 families of check-clean invalid
  wasm, with their 15 capability-matrix cells in the named set `d16360-matrix-silent-cells`.
