## Infrastructure (Track F)

- **The negative-type sentinel in `assignable`, counted:** 16 of 378 `assignable` / `assignableExpr`
  call sites hand it a negative type on the corpus, in three shapes (an open type component, a
  missing node record, a pending return); 211 corpus cases depend on the silent accept.
  `docs/internals/refactor-notes/2026-11-14-assignable-negative-sentinel-census.md`.
