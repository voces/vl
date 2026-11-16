## Type system (Track A)

- **D3299, D3436 closed: an un-annotated parameter written into a place admitting `null` stays
  pin-generic** (`refactor-notes/2026-11-16-l2-c-write-flow-skip.md`). The place reads at the
  pin's member, as `<T>`'s write does, so `s = x; print(s.length)` runs at `g("abc")`. A
  literal-holding place keeps the inferred answer, so a literal argument still adapts.
