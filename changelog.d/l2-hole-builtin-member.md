## Type system (Track A)

- **D16882 closed: a string or list built-in method called on an un-annotated parameter runs**
  (`refactor-notes/2026-11-16-l2-hole-builtin-member.md`). `take(a) { a.slice(0, 2) }` with
  `take("hello")` was refused as an unmet row demand `{slice: _}`. The built-in now answers the
  demand. A value read or a wrong call is refused as its direct spelling is.
