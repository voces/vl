# Step 7: a list literal's rendered record element is keyed by its row type, 2026-11-13

`arrLitElemKeyTy` gives `collectAArrayLit`'s stored-element intern the type its row name was
built from. At the nominal rung (`arrLitNominalElemName`, a list whose lead element is not a
literal), it answered `cUserTypes[name]`. That is right for a declared name. It is -1 for the
render of an anonymous record (`{r:i32}`), and then `rlInternNameTyK` re-parsed the name
(`repElemTyOfName`).

Such a name is `shapeNominalOfTy` of the element's row type, and `arrLitNominalRowTy` already
answers that type. The rung now passes it through `rlKeyTyOf`. A record holding a function
stays keyed by its name, as #7636's contract requires. An `#anon` row is keyed by its recorded
type in `rlInternNameTyK` (`anonRowTyOfName`).

## Graded

A probe compared `arrLitNominalRowTy` with the name parse at every reach of the rung, with
marks reset per compiled program, over 24,170 programs on master `088d205f5`:

| name | programs | key and type agree |
| --- | --- | --- |
| declared (`cUserTypes` hit) | 14 | 14, and equal to `cUserTypes` |
| rendered, closed | 16 | 16 |
| rendered, a function inside the record (`rlKeyTyOf` declines) | 6 | (kept on the name) |
| `#anon` | 31 | (keyed by `anonRowTyOfName`, unchanged) |

## Measured

| instrument | result |
| --- | --- |
| full sweep, base master against this change, both fixpoint seeds | 24,235 same; 0 bytes-only movers; 0 output movers; 0 runs → not-runs; 0 new traps |
| the same on master `12fc8bc25`, after #7870 widened `rlKeyTyOf` | 24,240 same; 0 bytes-only movers; 0 output movers; 0 runs → not-runs; 0 new traps |
| fast set on the same tree | all green (fixpoint, lint-self clean, regress, filed witnesses, late demands, seed size, comment, ladder, sentinel, scan, render-parse and export ratchets); `vl_row_classes` 19 passed |
