# Step 7 L6: an if-join's union name hands back its type's row, 2026-11-12

This is step B, part 6, of the `unNames` spelling readers: the hub's `IfStmt` arm, which names a
value `if`'s join (`ifJoinUnionNameIn`). A probe compared four candidate rows against the row
the returned name is bound to (`unRowOfName`). The population is the whole sweep, 24,042
programs, of which 187 name an if-join's union. Counts are programs.

| candidate | same | differ | no row | name has none |
| --- | --- | --- | --- | --- |
| the join's type at the instance (`nodeTyInOf`) | 179 | 2 | 1 | 3 |
| the node's recorded type | 179 | 2 | 1 | 3 |
| `registeredUnionRowOfTy` of the instance type | 130 | 2 | 56 | 3 |
| the instance's closed type (`elabClosedTyAt`) | 45 | 0 | 138 | 3 |

The 2 that differ are twin rows under one spelling, with the same atoms in the same order:
`i32|string` in `literal-unions/coalesce-numeric-binding.vl` and `i32[]|i32` in
`unions/narrowed-numlit-list-arm-read.vl`. That is the identifier rung's floor. Both consumers of
the row are order-blind.

## Changed

- The `IfStmt` arm records the row the join's type at the instance keys to.

## Proof

- **Targeted.** The 143 of the 187 cells that are files were built and run on a master seed and
  this one: 143 identical in module bytes and output. CI's sweep is the proof for the population.
- **Checks.** lint-self is clean. `regress.vl` loses no runs. The export budget, with findings,
  has 0 dead exports. Render-parse is flat at 13 renders and 55 parses.
