# START-2: `union if record join row` (2026-11-26)

Regeneration 9's unowned class, granted to START-2 by CENSUS: 3 units across
`unions/union-if-record-join-unannotated-binding.vl` (`@start`, `inFn`) and D4645's witness.

`ifRefJoinOf` takes a struct join's slot from the arm that carries the rep. For a narrowed `x` that
arm's row comes from legacy's scope, which the IR builder does not hold, so the join got slot -1.
Legacy writes the `if` at `(result (ref $Out))` and declares the binding's local at that row. The
builder now takes that row from the join's rep (`repTyOf(rep)`, its `structIndexOfTy`) and builds
the link there. The miss stays for a rep with no struct row.

`ir-parity`: byte-identical on both programs and on the new sweep,
`unions/union-if-record-join-positions.vl`, which misses the class four times on master (module
`else if` chain, function chain, loop body, lambda).

Not in this class: the flipped spelling `if x is Err { { a: 8 } } else { x }` falls back on master
with `ref valtype with no interned shape`, inside a function and at module scope. D4645's direct
read `(if r is Out { r } else { { a: 0 } }).a` is still loud on legacy: `field access receiver is
not a struct`.
