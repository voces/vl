## Type system (Track A)

- **An explicit type argument fixes an empty list literal's element** (DECISIONS, chosen under the owner's delegation, follows D16342): `g<i32>([])` over `g<V>(v: V[]) { return v is f64[] }` now answers `false`, as `const e: i32[] = []` does; a literal nothing fixed still answers `true`.
