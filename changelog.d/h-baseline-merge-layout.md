## Infrastructure (Track F)

- **Budget baselines merge cleanly when lanes lower neighbouring rows.**
  `vl check --budget --write-baseline` no longer writes a `commit`, puts a blank line after
  every file row and entry, and keeps a loaded row or entry at zero instead of deleting it.
  Two branches lowering different files now merge without a conflict
  (`tests/vl_budget_merge_test.ts`). All nine `--budget` baselines are rewritten in the new
  layout.
