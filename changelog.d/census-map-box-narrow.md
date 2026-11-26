## Codegen, memory & runtime (Track B)

- **IR claims a union map read narrowed to a smaller boxed union:** `m[k]` over an `i32 | K` map in the else of `is K` (`i32 | null`) is the map's box held at that union, as a local's narrowed read is; the verifier admits it.
