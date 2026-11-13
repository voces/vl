# Step 7: a folded ref-list spelling's type is typed, not parsed, 2026-11-13

`rlInternNameTyK` records the arena type of the spelling a row is stored under (`rlElemTyIx`).
`rlElemStoredName` folds an element whose type is an `i32` or `string` list to `"i32[]"` or
`"string[]"`. When it did, the row's type came from re-parsing that folded name
(`fieldElemTyIxOfName(stored)`). `rlElemStoredTy(ty)` (emit_shape_rows) is the type twin of the
fold, `mkArrayTy(TY_I32)` or `mkArrayTy(TY_STR)`. A folded spelling now records it.

The rung is left for one case: an unfolded spelling whose caller passes no type. There the
name's resolve is the only source, and it shrinks as callers pass the type they hold.

## Graded

A probe on `6a04aed1a` merged with #7830 compared `rlElemStoredTy` with the parse at every
reach of the rung, with marks reset per compiled program, over 24,170 programs:

| case | programs | typed twin agrees |
| --- | --- | --- |
| folded, caller's hint | 48 | 48 |
| folded, through `kindTy` only | 0 | (unreached; same function) |
| unfolded, no hint, `kindTy` -1 | 29 | (rung kept) |
| unfolded, no hint, `kindTy` held | 43 | (rung kept; `kindTy` differs from the parse in 20) |

## Measured

| instrument | result |
| --- | --- |
| full sweep, base master against this change, both fixpoint seeds | 24,225 same; 0 bytes-only movers; 0 output movers; 0 runs → not-runs; 0 new traps |
| fast set on the same tree | all green (fixpoint, lint-self clean, regress, filed witnesses, late demands, seed size, comment, ladder, sentinel, scan, render-parse and export ratchets); `vl_row_classes` 19 passed |
