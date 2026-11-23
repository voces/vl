## Codegen, memory & runtime (Track B)

- **IR coverage: a record type no struct row records is held at the row legacy stores it in, byte-identical to legacy.** One predicate, `rowlessStoredTy`, decides it at two points: a value an expression builds takes the row `structIndexOfExpr` names, and a `let` takes its slot's row, with reads of it at that row. A `null`-typed name's null test is legacy's constant. tests/cases functions with no blocker rose 78,599 → 78,609; the distilled corpus held at 45,428.
