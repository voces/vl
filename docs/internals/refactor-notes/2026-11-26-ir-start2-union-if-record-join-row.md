# START-2: `union if record join row` and D4645 (2026-11-26)

Regeneration 9's unowned class, granted to START-2 by CENSUS: 3 units across
`unions/union-if-record-join-unannotated-binding.vl` (`@start`, `inFn`) and D4645's witness. The
coordinator folded two neighbouring findings into the same branch.

1. **The join row.** `ifRefJoinOf` takes a struct join's slot from the arm that carries the rep. For a
   narrowed `x`, that arm's row comes from legacy's scope, which the IR builder does not hold, so
   the join got slot -1, and the lowering's blocktype then refused (`ref valtype with no interned
   shape`). Legacy writes the `if` at `(result (ref $Out))`. The builder now takes that row from the
   join's rep (`repTyOf(rep)`, its `structIndexOfTy`) for any struct join with no slot. That covers
   the union-typed spellings (the class) and the flipped `if x is Err { { a: 8 } } else { x }`, which
   is not union-typed and fell back on master. The miss stays, as `if record join row`, for a rep
   with no struct row.
2. **A field read off a value `if`.** `(if r is Out { r } else { { a: 0 } }).a` is refused by legacy
   (`field access but no struct type declared`), because its field plans name no struct for an `if`
   receiver. The builder takes the plain field read for an `if` receiver whose rep is a record.
   The lowering (`ifJoinField`) reads the field at the row of the operand's rep, as `sharedField`
   reads a field at a row it names.

Graded under `VL_IR_REQUIRE_CLAIM=1` (isolated host) against a control compiler without the change,
which refuses every one. D4645's grading list passes: its repro, the three ablation spellings, and
D2907's un-annotated and direct spellings. `ir-parity --behaviour-only`: byte-identical wherever
legacy builds the program. A program with a direct read is one legacy refuses, so it has no
claimless twin.
