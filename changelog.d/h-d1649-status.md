## Infrastructure (Track F)

- **D1649 leaves the open queue.** The row was fixed on 2026-09-05 (`export` before a
  non-declaration is a parse error and `vl fmt` keeps the file). Its status line led with "now a
  loud check reject" and put "closed" in a later clause, so `inventory/ls.vl --status open`, which
  reads the first clause, kept listing it. Re-graded on master and reordered.
- **A row's state is its status line's first clause, and the inventory test now holds every row to
  it.** 35 more rows that had been fixed or closed still led with their old outcome and named
  "closed" or "fixed" only in a later clause. Their witnesses were re-run with `--strict`, all as
  filed, and the closed clause moved to the front. D2065 (an unbuilt ruling), D12239 and D13966
  (partly closed) now lead with what is still open. `--status open` falls from 273 to 237. The new
  guard in `tests/vl_inventory_rows_test.ts` refuses a row whose first clause reads open while a
  later clause starts with a settled word, and a negated clause (`not closed`) is exempt.
- **D16064 filed: D13966's open half now has a row of its own.** A call through a `let`
  re-pointed between functions whose results differ is still refused at check, though a list
  element holding the same two now dispatches. D13966 leads with its closed clause-1 trap and names
  D16064 as residue.
