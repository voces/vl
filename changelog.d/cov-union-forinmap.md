## Codegen, memory & runtime (Track B)

- **IR builds a `for ... in` over a global whose type unions a map with another type, narrowed to the map (lane COV-UNION):** the walk reads the narrowed global as its receiver operand, then legacy's recovery, for keys, values and pairs. Before, the IR refused (`for in map receiver`).
