## Codegen, memory & runtime (Track B)

- **IR holds a built record list at the row legacy lays it out on (lane COV-UNION, layout-family adoption):** a list literal, call, slice, filter or spread whose ref-list row (`refListSlotOfExpr`, the function the lowering's element read already uses) holds another record than its type names, such as a kept maker's records built at the row they are adopted at, takes that row's list rep, and its temps are typed there. The IR's reads of its elements then meet legacy's array as it stands.
