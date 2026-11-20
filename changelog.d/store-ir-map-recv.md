## Codegen, memory & runtime (Track B)

- **IR: map operations on any receiver:** `m[k] ?? d`, `m.has(k)` and `m[k] = v` now build in the IR on a parameter, local, field or element map, not only on a module global: each node carries its receiver as an operand beside the global symbol, and the lowering writes legacy's receiver tail, key and tail around it. Byte-identical; the self-compile claims 177 more functions and the distilled corpus 93, and `map read receiver` (196 distilled functions alone) goes to 0.
