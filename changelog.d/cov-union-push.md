## Codegen, memory & runtime (Track B)

- **IR builds a `.push` whose receiver holds a branch of its own, and an optional receiver below a value that assigns (lane COV-UNION):** `(m.get(1) ?? l[1]).push(3)`, `(if k > 0 { a } else { b }).push(k)` and a captured cell's guarded read are written whole before the value, as legacy writes them; `xs?.push(c = 5)` reads its receiver at the push, after the value's store, as legacy does. Before, the IR refused (`push short-circuit operand`).
