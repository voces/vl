## Codegen, memory & runtime (Track B)

- **IR walks lists of maps, vectors, element lists and nullable closures as legacy does** (capability probe `for-in-over-map-list`). A `for` over a list whose element is a map, a nullable map, an `F32x4`, an `f32[]` or `F32x4[]` list, a nullable list of any element kind, or a nullable closure is legacy's plain walk: the walk reads each element whole at its own rep. Byte-identical; no legacy byte moved. A `(… | null)[]` of `nulnone` elements stays refused.
