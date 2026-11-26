## Codegen, memory & runtime (Track B)

- **IR builds a binding whose initializer is an assignment into a literal-union place (lane COV-UNION):** `const v = k = "ww"` holds the member written as the place's atom, the way legacy's cell holds it. The place can be a `K | null` local, a `K` local or a parameter. Before, the IR refused (`atom cell local rep`).
