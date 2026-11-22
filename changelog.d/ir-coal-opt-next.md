## Codegen, memory & runtime (Track B)

- **IR coverage: a nullable reference's `??` over a temp operand.** `(o[i] ?? r).x` and `(mk(b) ?? r).x` build the operand inside the block the plain arm opens, as legacy writes it (`SCoalBox.cbLB`), and a `??` the optional-chain rung passes on reaches those rungs (`coalOptPassesToNulRefs`).
