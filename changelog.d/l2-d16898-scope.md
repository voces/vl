## Type system (Track A)

- **D16898 scoped** (`refactor-notes/2026-11-17-l2-d16898-scope.md`): check already knows every
  map type in the witness. The one fact it lacks is the signature of an un-annotated function
  that is only taken as a value, which mono's i32 default answers today. The choice is a
  language decision, listed with three options. No behaviour changes.
