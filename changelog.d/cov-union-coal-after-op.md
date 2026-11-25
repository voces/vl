## Codegen, memory & runtime (Track B)

- **IR covers `o.v ?? d` over a value-union field after another operand (lane COV-UNION):** the union field arms (`fieldBox`, `fieldVal`) stage an earlier operand's temps below their test, as legacy writes that operand first; `scripts/plumb-shape-cost.vl`'s `checkUnit` is claimed.
