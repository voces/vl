## Codegen, memory & runtime (Track B)

- **IR coverage: a map keys walk binds its key at the walked map's own key rep.** Before, the rep was read from the interned map node, which is shared by every map type with the same value type. So an `i64`-keyed walk refused (`for in map element rep`) after a `string`-keyed map with that value type had been built. The key rep is now recorded on the walk when it is built, and the verifier checks the loop variable against it. No legacy bytes moved.
