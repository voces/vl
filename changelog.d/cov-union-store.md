## Codegen, memory & runtime (Track B)

- **IR builds an element store whose index holds a branch (lane COV-UNION):** in `xs[if a { 0 } else { 1 }] = v`, `e.list[match k { … }] = v` and `xs[m.get(1) ?? 1] = v`, the receiver is staged below the index's branch, as legacy writes the receiver first. Before, the IR refused (`store short-circuit operand`).
