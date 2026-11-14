## Infrastructure (Track F)

- **Hash-consed types with binder identity, designed** (review medium 1): the 147,421-row
  self-compile arena holds at most 15,979 distinct types; one intern table, holes as rows with a
  solution column, a nominal key column for the 26 sidecars, and projections for the four
  comparers, in six code-deleting stages (about −2,000 lines):
  `docs/internals/refactor-notes/2026-11-14-type-hashcons-design.md`.
