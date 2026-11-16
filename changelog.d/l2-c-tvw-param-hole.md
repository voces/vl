## Type system (Track A)

- **L2 (c) PR 1: `tvPlaceWrite` admits an un-annotated parameter's hole**
  (`refactor-notes/2026-11-16-l2-c-tvw-param-hole.md`). A write of a parameter hole into a place
  admitting `null` narrows the place to the pin's member, as a type parameter's write does.
  Identical alone: 0 of 20,741 programs move.
