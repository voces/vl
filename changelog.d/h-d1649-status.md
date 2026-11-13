## Infrastructure (Track F)

- **D1649 leaves the open queue.** The row was fixed on 2026-09-05 (`export` before a
  non-declaration is a parse error and `vl fmt` keeps the file). Its status line led with "now a
  loud check reject" and put "closed" in a later clause, so `inventory/ls.vl --status open`, which
  reads the first clause, kept listing it. Re-graded on master and reordered.
