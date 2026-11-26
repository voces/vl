# START-2: `store element record literal` (2026-11-26)

Regen-10 lists 2 units, `go` in `closures/shared-let-without-zero-value.vl` and in
`closures/shared-let-read-early-traps-nullable.vl`. Each has a `let` with no initializer, captured
by a closure and then assigned. It is shared through a cell, and its assignments store a literal
into a nested list slot (`idxStorePlanOf`'s `nestSlot`).

`elemStore` skipped any such store whose value is a list literal holding a record literal. Its stated
reason is that legacy and the lowering bank the element-read row apart. A probe with the skip
removed claims both programs, byte-identical to legacy. The plain spellings (`xss[0] = [{ x: 2 }]`
into a `P[][]`, a parameter's, a nullable element's) were already claimed on master. The skip and
`listLitHoldsObjLit` are deleted; the gate's `ir shadow cases` regrades every corpus program.
