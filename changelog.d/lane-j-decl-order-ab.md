## Infrastructure (Track F)

- **`scripts/decl-order-ab.vl`:** runs every single-file `@run` case as written and with its
  top-level functions moved last, and exits 1 when a case moves to a clause-1 outcome its
  baseline (`scripts/decl-order-ab-baseline.txt`, 320 cases, 38 clause 1) does not record. The
  38 clause-1 cells are the named distilled set `d16301-decl-order` (D16301).
