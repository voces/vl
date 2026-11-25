## Codegen, memory & runtime (Track B)

- **IR coverage: a union box narrowed to a nullable list, closure or map.** The read takes
  legacy's own niche tail, as the `boolean | null` and `string | null` niches already did. No
  legacy bytes moved.
