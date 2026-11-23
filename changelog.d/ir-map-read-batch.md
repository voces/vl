## Codegen, memory & runtime (Track B)

- **IR coverage, the map-read tail:** the IR builds an atom-valued map read under `??` (`map read atom`), a `K | null` or `boolean | null` map read at its null sentinel (`map read sentinel`, through the shared `mapGetOrSentinelHead`/`Tail`), a bare read of a map whose value is already a ref niche, and a narrowed read of a scalar slot or of the record inside a nullable value (`map get rep`).
