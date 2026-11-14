## Type system (Track A)

- **The O5 `as` trio is recorded as built, and its residue is filed.** open-rulings.md had
  recorded the union-`as` propagation the owner ruled 2026-07-26 as unbuilt. Re-verified: it
  runs, including a propagated error record. Its module-scope spelling is the ruled no-caller
  refusal. Two clause-2 emit refusals remain and are now filed: D16066, the propagating `as`
  over a nullable struct, list or map; and D16067, a nullable closure cell under all three forms.
  error-handling-design.md §Trio notes what has been built since its last update.
