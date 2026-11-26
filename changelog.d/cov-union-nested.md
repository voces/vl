## Codegen, memory & runtime (Track B)

- **IR builds a list element held as a union box, narrowed by `is` and read at a record arm (lane COV-UNION):** `if xs[0] is A { const q = xs[0] }` reads the element as stored, then unboxes it to the arm's record (`RArmUnbox`), as legacy writes it, for a nested or a one-level element, bound or passed. Before, the IR refused (`index element coercion`).
