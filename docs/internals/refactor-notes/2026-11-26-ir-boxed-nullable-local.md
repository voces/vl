# A slotless local at a boxed nullable rep is declared at the box's nullable ref (lane COV-START)

**What.** `repLocalValtype` declared a slotless local only at a non-null or bottom-ref nullable
rep (`rdNul` 0 or 1). The `is K` stash of a map read of a union value (`if p["k"] is AB`) is a
local at the read's boxed nullable (`rdNul` 4, kind `union`), so the claim fell back with
`slotless local at a rep with no valtype` (CENSUS, registry-7, coordinator-routed). It is now
declared at `fbValtypeNullable("union")`, `(ref null $uBox)`, which is legacy's declaration.

**Measured.** Per-function census, master `190912ce2` vs head: identical in all four populations
(no corpus program reaches the shape). New fixture
`tests/cases/maps/map-union-read-is-literal-set-stash-positions.vl` (a function, top level, the
other member): master's armed run shows `unlowered: slotless local at a rep with no valtype in
show`, head shows none and prints `b b int`; the claimed bytes differ from legacy only in the
locals prefix. `ir-identity.sh --cases`: 0 differ, behaviour 164 of 164 same, witnesses 81 same.
