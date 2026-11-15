## Infrastructure (Track F)

- **`ls.vl --next` and `--reserve` see unmerged branches:** each also skips, or refuses, every id a
  fetched `origin/*` branch adds a row or a reservation for beside `origin/master`, naming the
  branch, so two lanes whose branches have not merged no longer take the same block. A claim whose
  work has landed (an id in it is filed) is ignored. Fixture test in `vl_inventory_ls_test.ts`.
