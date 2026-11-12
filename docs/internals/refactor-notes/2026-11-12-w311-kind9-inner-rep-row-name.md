# Step 7: a kind-9 inner element holding un-annotated functions is named off its rep, 2026-11-12

When `ensureRefElemTys` (`emit_union_atoms.vl`) mints a list of lists, it names the inner row
from the inner element type (`rlRowNameOfTy`). That declines a type with a hole. The inner name
was then cut out of the caller's spelling (`refArrElemName`), and an `emitFail` probe showed that
cut firing on 31 cells. In every one the element holds un-annotated functions, whose spelling
carries their rep (an i32 id). A new rung, `rlRepRowNameOfTy`, answers before the cut, with the
same rule #7342 applied to kinds:
- for a list of a tagged set's ids, its i32 list spelling (`fnTagListRepName`);
- for a record, its struct row (`structRowOfRecordTy`, else `repRowOfTyStruct`).

## Measurement

The cut now fires on 6 cells, down from 31. Their outer spellings fall into three groups:
- `{f:i32}[]` (3 cells: D15350, D15359, `fn-tagged-ids-in-records-two-lists-deep.vl`), a record
  whose field is a hole function, with no row by type or by rep;
- `{fs:i32[]}[][]` (2 cells: `d15220_cell_three_levels.vl`,
  `fn-tagged-ids-in-records-in-nested-lists.vl`), a list of such records;
- `((i32)=>i32)[]` (1 cell: `hole-fn-nested-list-map-value.vl`), a bare hole function.

A list rung that recursed, naming the inner list `#anon0[]`, also served the two
list-of-records cells. But their outer key still spells `{fs:i32[]}[]`, so each module grew by 2
types, one row under two keys. That rung is left out.

Fixpoint seeds on both sides, over the whole sweep population, base master `bebbc99d`: same
23,961, bytes-only 11, output movers 0, runs → not-runs 0, new compiler traps 0. All 11 movers
keep their size, their type count and their lines, and only the type indices reorder: D15220,
seven `d15220_cell_*` named cells and three `fn-tagged-*` cases.
