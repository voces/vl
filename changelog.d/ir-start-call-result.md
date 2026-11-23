## Codegen, memory & runtime (Track B)

- **IR: a call result of another record row, list, map or box rep is built at the callee's rep** (`start: call result coercion` and its body twin). When no coercion is keyed at the call node, legacy writes the reference the callee returns as it stands; the IR now does the same. Before, a record result was taken only when the call's own type keyed the callee's row (`callAtCalleeResultRow`), and the other kinds missed.
