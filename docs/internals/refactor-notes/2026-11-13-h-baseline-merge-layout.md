# 2026-11-13 — lane H: budget baselines merge without conflict when lanes lower neighbouring rows

Lanes lowering different files of one `vl check --budget` baseline conflicted on every merge.
There were three causes in the writer's layout:

- The `commit` line changed on every write.
- File rows and entries sat on adjacent lines, so edits to neighbours shared a hunk.
- A row or entry that reached zero was deleted. Git conflicts a deletion against an edit of the
  next line whatever the separator; one, two and three blank lines all conflicted in a
  simulation.

## The layout

`budgetWriteText` (compiler/cli_budget.vl) now:

- writes no `commit`. The HEAD-resolving reads behind it (`budgetGitStart`/`Step`/`Commit`,
  `ST_BUDGET_GIT`) are deleted, and `--budget-why`'s header reads `baseline -> working tree`;
- writes a blank line after every file row and every entry;
- keeps a row or entry the loaded baseline held, at zero, so a lowering only edits lines.
  `--budget-why` counts a zero entry as no name.

## Evidence

Scratch-repo simulation with the real writer over the render-parse findings, two branches
lowering from one base:

| scenario | old writer | new writer |
| --- | --- | --- |
| last entry of emit_shape_intern vs first of emit_shape_rows (same code) | conflict | clean |
| emit_sections zeroed vs emit_shape_intern lowered | conflict | clean |
| emit_mv_slots (`ty-render`) vs emit_mono (`ty-render-display`) | conflict | clean |

Each merged baseline holds the combined tree (`budget ok`). Two lanes lowering the same file still
write one identical row edit, which git takes once; that loosens the row by one, as it already did.

`tests/vl_budget_merge_test.ts` pins this: two branches lower neighbouring files, one to zero,
and the merge must be clean, with the rows, the kept zero entries and the budget checked. On the
old writer the same test fails with `CONFLICT (content): Merge conflict in b.json`.

All nine `--budget` baselines are rewritten in the new layout. The parsed content is unchanged
apart from the dropped `commit`; two drifts on master (a scan finding already gone from
emit_shape_rows, a renamed render-parse entry) are kept as master has them.
