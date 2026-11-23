## Codegen, memory & runtime (Track B)

- **IR returns two more shapes as legacy does** (`return coercion`).
  - A returned `Map()` is built at the result's map, the shape legacy's constructor writes for the instance (a generic's shared node is typed at its template).
  - A value that a ref-niche nullable result (`T | null` held as a nullable ref) holds as it stands, its inner rep or one stored at the inner's valtype, is returned so. The verifier's return rule accepts the same, from the pair the facts pass notes; keyed self-tests pin both sides.
